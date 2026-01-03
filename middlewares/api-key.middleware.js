import apiKeysService from "../services/api-keys.service.js";
import logger from "../utilities/logger.js";
import { ForbiddenError, UnauthorizedError } from "../utilities/errors.js";

/**
 * API Key Authentication Middleware
 * Validates API keys from X-API-Key header or apiKey query parameter
 */

/**
 * Extract API key from request
 * Checks: X-API-Key header, Authorization header with "ApiKey" scheme, query param
 */
function extractApiKey(req) {
  // Check X-API-Key header first
  const headerKey = req.headers["x-api-key"];
  if (headerKey) {
    return headerKey;
  }

  // Check Authorization header with "ApiKey" scheme
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith("apikey ")) {
    return authHeader.substring(7).trim();
  }

  // Check query parameter
  if (req.query.apiKey) {
    return req.query.apiKey;
  }

  return null;
}

/**
 * Require API key authentication
 * Use this for external API routes (/api/v1/*)
 *
 * Sets:
 * - req.apiKey: API key data
 * - req.organizationId: Organization ID from the key
 *
 * @param {string|string[]} requiredScopes - Scope(s) required for this endpoint
 */
export const requireApiKey = (requiredScopes = []) => {
  const scopes = Array.isArray(requiredScopes)
    ? requiredScopes
    : [requiredScopes];

  return async (req, res, next) => {
    try {
      const rawKey = extractApiKey(req);

      if (!rawKey) {
        return res.status(401).json({
          success: false,
          error: {
            code: "API_KEY_REQUIRED",
            message:
              "API key is required. Provide via X-API-Key header or apiKey query parameter.",
          },
        });
      }

      // Validate the key
      const apiKeyData = await apiKeysService.validateApiKey(rawKey);

      if (!apiKeyData) {
        logger.warn(
          { keyPrefix: rawKey.substring(0, 12) },
          "Invalid API key attempt"
        );
        return res.status(401).json({
          success: false,
          error: {
            code: "INVALID_API_KEY",
            message: "Invalid or expired API key.",
          },
        });
      }

      // Check required scopes
      if (scopes.length > 0) {
        const missingScopes = scopes.filter(
          (scope) => !apiKeysService.hasScope(apiKeyData, scope)
        );
        if (missingScopes.length > 0) {
          logger.warn(
            {
              keyPrefix: apiKeyData.keyPrefix,
              missingScopes,
            },
            "API key missing required scopes"
          );

          return res.status(403).json({
            success: false,
            error: {
              code: "INSUFFICIENT_SCOPE",
              message: `API key missing required scope(s): ${missingScopes.join(
                ", "
              )}`,
              requiredScopes: scopes,
              missingScopes,
            },
          });
        }
      }

      // Attach API key data to request
      req.apiKey = apiKeyData;
      req.organizationId = apiKeyData.organizationId;
      req.authMethod = "api_key";

      logger.debug(
        {
          keyPrefix: apiKeyData.keyPrefix,
          organizationId: apiKeyData.organizationId,
          endpoint: req.url,
        },
        "API key authenticated"
      );

      next();
    } catch (error) {
      logger.error({ error, url: req.url }, "API key authentication error");
      return res.status(500).json({
        success: false,
        error: {
          code: "AUTH_ERROR",
          message: "Authentication error",
        },
      });
    }
  };
};

/**
 * Optional API key check - doesn't fail if no key
 * Useful for endpoints that accept both Clerk and API key auth
 */
export const optionalApiKey = async (req, res, next) => {
  try {
    const rawKey = extractApiKey(req);

    if (rawKey) {
      const apiKeyData = await apiKeysService.validateApiKey(rawKey);
      if (apiKeyData) {
        req.apiKey = apiKeyData;
        req.organizationId = apiKeyData.organizationId;
        req.authMethod = "api_key";
      }
    }

    next();
  } catch (error) {
    // Don't fail, just continue without API key
    next();
  }
};

export default requireApiKey;
