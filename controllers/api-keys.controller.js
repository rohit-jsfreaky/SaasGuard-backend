import asyncHandler from "../utilities/async-handler.js";
import { ValidationError, NotFoundError } from "../utilities/errors.js";
import apiKeysService from "../services/api-keys.service.js";
import {
  API_KEY_SCOPES,
  DEFAULT_API_KEY_SCOPES,
} from "../models/api-keys.model.js";
import logger from "../utilities/logger.js";

/**
 * POST /api/organizations/:orgId/api-keys
 * Create a new API key for the organization
 */
export const createApiKey = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const { name, scopes, expiresAt } = req.body;
  const createdBy = req.dbUser?.id;

  if (isNaN(orgId)) {
    throw new ValidationError("Invalid organization ID");
  }

  if (!name || name.trim().length === 0) {
    throw new ValidationError("API key name is required");
  }

  // Validate scopes if provided
  let validScopes = DEFAULT_API_KEY_SCOPES;
  if (scopes && Array.isArray(scopes)) {
    const allowedScopes = Object.values(API_KEY_SCOPES);
    const invalidScopes = scopes.filter((s) => !allowedScopes.includes(s));
    if (invalidScopes.length > 0) {
      throw new ValidationError(`Invalid scopes: ${invalidScopes.join(", ")}`);
    }
    validScopes = scopes;
  }

  // Parse expiration date if provided
  let expirationDate = null;
  if (expiresAt) {
    expirationDate = new Date(expiresAt);
    if (isNaN(expirationDate.getTime())) {
      throw new ValidationError("Invalid expiration date");
    }
    if (expirationDate <= new Date()) {
      throw new ValidationError("Expiration date must be in the future");
    }
  }

  const apiKey = await apiKeysService.createApiKey(
    orgId,
    name.trim(),
    validScopes,
    expirationDate,
    createdBy
  );

  logger.info(
    {
      orgId,
      keyId: apiKey.id,
      keyPrefix: apiKey.keyPrefix,
    },
    "API key created"
  );

  res.status(201).json({
    success: true,
    message: "API key created. Copy the key now - it will not be shown again!",
    data: apiKey,
  });
});

/**
 * GET /api/organizations/:orgId/api-keys
 * List all API keys for the organization
 */
export const listApiKeys = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);

  if (isNaN(orgId)) {
    throw new ValidationError("Invalid organization ID");
  }

  const keys = await apiKeysService.getOrganizationApiKeys(orgId);

  res.json({
    success: true,
    data: keys,
    meta: {
      total: keys.length,
      availableScopes: Object.values(API_KEY_SCOPES),
    },
  });
});

/**
 * DELETE /api/organizations/:orgId/api-keys/:keyId
 * Delete (permanently) an API key
 */
export const deleteApiKey = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const keyId = parseInt(req.params.keyId, 10);

  if (isNaN(orgId) || isNaN(keyId)) {
    throw new ValidationError("Invalid organization ID or key ID");
  }

  await apiKeysService.deleteApiKey(keyId, orgId);

  res.status(200).json({
    success: true,
    message: "API key deleted",
  });
});

/**
 * POST /api/organizations/:orgId/api-keys/:keyId/revoke
 * Revoke an API key (soft delete)
 */
export const revokeApiKey = asyncHandler(async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const keyId = parseInt(req.params.keyId, 10);

  if (isNaN(orgId) || isNaN(keyId)) {
    throw new ValidationError("Invalid organization ID or key ID");
  }

  await apiKeysService.revokeApiKey(keyId, orgId);

  res.status(200).json({
    success: true,
    message: "API key revoked",
  });
});

/**
 * GET /api/organizations/:orgId/api-keys/scopes
 * Get available API key scopes
 */
export const getAvailableScopes = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      scopes: Object.entries(API_KEY_SCOPES).map(([key, value]) => ({
        name: key,
        value: value,
        description: getScopeDescription(value),
      })),
      defaults: DEFAULT_API_KEY_SCOPES,
    },
  });
});

function getScopeDescription(scope) {
  const descriptions = {
    "permissions:read": "Read user permissions and feature access",
    "usage:read": "Read usage data for users",
    "usage:write": "Record usage for users",
    "users:sync": "Sync/create users from your application",
  };
  return descriptions[scope] || scope;
}
