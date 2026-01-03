import { eq, and, isNull, or, gt } from "drizzle-orm";
import crypto from "crypto";
import db from "../config/db.js";
import { apiKeys, DEFAULT_API_KEY_SCOPES } from "../models/api-keys.model.js";
import logger from "../utilities/logger.js";
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from "../utilities/errors.js";

/**
 * ApiKeysService - Handles API key generation, validation, and management
 */
class ApiKeysService {
  /**
   * Generate a new API key
   * @param {number} organizationId - Organization ID
   * @param {string} name - Human-readable name for the key
   * @param {string[]} scopes - Array of scopes
   * @param {Date|null} expiresAt - Expiration date or null for never
   * @param {number} createdBy - User ID who created the key
   * @returns {Promise<Object>} Created key object (includes raw key - only shown once!)
   */
  async createApiKey(
    organizationId,
    name,
    scopes = DEFAULT_API_KEY_SCOPES,
    expiresAt = null,
    createdBy = null
  ) {
    if (!organizationId) {
      throw new ValidationError("Organization ID is required");
    }
    if (!name || name.trim().length === 0) {
      throw new ValidationError("API key name is required");
    }

    // Generate a secure random key
    const rawKey = this._generateKey();
    const keyHash = this._hashKey(rawKey);
    const keyPrefix = rawKey.substring(0, 12); // "sg_" + first 8 chars

    try {
      const [newKey] = await db
        .insert(apiKeys)
        .values({
          organizationId,
          keyHash,
          keyPrefix,
          name: name.trim(),
          scopes: JSON.stringify(scopes),
          expiresAt,
          createdBy,
        })
        .returning();

      logger.info(
        {
          keyId: newKey.id,
          organizationId,
          keyPrefix,
          scopes,
        },
        "API key created"
      );

      return {
        id: newKey.id,
        key: rawKey, // Only returned once!
        keyPrefix: newKey.keyPrefix,
        name: newKey.name,
        scopes: JSON.parse(newKey.scopes || "[]"),
        expiresAt: newKey.expiresAt,
        createdAt: newKey.createdAt,
      };
    } catch (error) {
      logger.error({ error, organizationId }, "Failed to create API key");
      throw error;
    }
  }

  /**
   * Validate an API key and return its details
   * @param {string} rawKey - The raw API key from the request
   * @returns {Promise<Object|null>} API key details or null if invalid
   */
  async validateApiKey(rawKey) {
    if (!rawKey || typeof rawKey !== "string") {
      return null;
    }

    // Must start with "sg_"
    if (!rawKey.startsWith("sg_")) {
      return null;
    }

    const keyHash = this._hashKey(rawKey);

    try {
      const [key] = await db
        .select()
        .from(apiKeys)
        .where(
          and(
            eq(apiKeys.keyHash, keyHash),
            isNull(apiKeys.revokedAt),
            or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date()))
          )
        )
        .limit(1);

      if (!key) {
        return null;
      }

      // Update last used timestamp (don't await - fire and forget)
      this._updateLastUsed(key.id).catch((err) =>
        logger.warn({ err, keyId: key.id }, "Failed to update lastUsedAt")
      );

      return {
        id: key.id,
        organizationId: key.organizationId,
        name: key.name,
        scopes: JSON.parse(key.scopes || "[]"),
        keyPrefix: key.keyPrefix,
      };
    } catch (error) {
      logger.error({ error }, "Failed to validate API key");
      return null;
    }
  }

  /**
   * Check if an API key has a specific scope
   * @param {Object} apiKeyData - API key data from validateApiKey
   * @param {string} requiredScope - Required scope
   * @returns {boolean}
   */
  hasScope(apiKeyData, requiredScope) {
    if (!apiKeyData || !apiKeyData.scopes) {
      return false;
    }
    return apiKeyData.scopes.includes(requiredScope);
  }

  /**
   * Get all API keys for an organization
   * @param {number} organizationId - Organization ID
   * @returns {Promise<Object[]>} Array of API keys (without hash)
   */
  async getOrganizationApiKeys(organizationId) {
    if (!organizationId) {
      throw new ValidationError("Organization ID is required");
    }

    try {
      const keys = await db
        .select({
          id: apiKeys.id,
          keyPrefix: apiKeys.keyPrefix,
          name: apiKeys.name,
          scopes: apiKeys.scopes,
          lastUsedAt: apiKeys.lastUsedAt,
          expiresAt: apiKeys.expiresAt,
          createdAt: apiKeys.createdAt,
          revokedAt: apiKeys.revokedAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.organizationId, organizationId))
        .orderBy(apiKeys.createdAt);

      return keys.map((key) => ({
        ...key,
        scopes: JSON.parse(key.scopes || "[]"),
        isActive:
          !key.revokedAt && (!key.expiresAt || key.expiresAt > new Date()),
      }));
    } catch (error) {
      logger.error(
        { error, organizationId },
        "Failed to get organization API keys"
      );
      throw error;
    }
  }

  /**
   * Revoke an API key
   * @param {number} keyId - API key ID
   * @param {number} organizationId - Organization ID (for authorization check)
   * @returns {Promise<void>}
   */
  async revokeApiKey(keyId, organizationId) {
    if (!keyId || !organizationId) {
      throw new ValidationError("Key ID and Organization ID are required");
    }

    try {
      const [key] = await db
        .select()
        .from(apiKeys)
        .where(
          and(eq(apiKeys.id, keyId), eq(apiKeys.organizationId, organizationId))
        )
        .limit(1);

      if (!key) {
        throw new NotFoundError("API key not found");
      }

      if (key.revokedAt) {
        throw new ConflictError("API key already revoked");
      }

      await db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(eq(apiKeys.id, keyId));

      logger.info({ keyId, organizationId }, "API key revoked");
    } catch (error) {
      logger.error(
        { error, keyId, organizationId },
        "Failed to revoke API key"
      );
      throw error;
    }
  }

  /**
   * Delete an API key permanently
   * @param {number} keyId - API key ID
   * @param {number} organizationId - Organization ID
   * @returns {Promise<void>}
   */
  async deleteApiKey(keyId, organizationId) {
    if (!keyId || !organizationId) {
      throw new ValidationError("Key ID and Organization ID are required");
    }

    try {
      const result = await db
        .delete(apiKeys)
        .where(
          and(eq(apiKeys.id, keyId), eq(apiKeys.organizationId, organizationId))
        );

      logger.info({ keyId, organizationId }, "API key deleted");
    } catch (error) {
      logger.error(
        { error, keyId, organizationId },
        "Failed to delete API key"
      );
      throw error;
    }
  }

  /**
   * Generate a secure random API key
   * Format: sg_<32 random chars>
   * @private
   */
  _generateKey() {
    const randomPart = crypto.randomBytes(24).toString("base64url");
    return `sg_${randomPart}`;
  }

  /**
   * Hash an API key using SHA256
   * @private
   */
  _hashKey(rawKey) {
    return crypto.createHash("sha256").update(rawKey).digest("hex");
  }

  /**
   * Update last used timestamp
   * @private
   */
  async _updateLastUsed(keyId) {
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, keyId));
  }
}

const apiKeysService = new ApiKeysService();
export default apiKeysService;
