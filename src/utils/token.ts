/**
 * Token Utilities
 * Helpers for extracting and validating authentication tokens
 */

/**
 * Extract Bearer token from Authorization header
 * @param authHeader - Authorization header value
 * @returns Token string or null if invalid format
 */
export function extractBearerToken(
  authHeader: string | undefined
): string | null {
  if (!authHeader) {
    return null;
  }

  // Check for Bearer format
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer") {
    return null;
  }

  const token = parts[1];
  if (!token || token.trim() === "") {
    return null;
  }

  return token;
}

/**
 * Validate JWT token format (basic check, not cryptographic validation)
 * @param token - JWT token string
 * @returns True if token has valid JWT format (3 parts separated by dots)
 */
export function isValidJwtFormat(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

/**
 * Decode JWT payload without verification (for debugging only)
 * @param token - JWT token string
 * @returns Decoded payload or null if invalid
 */
export function decodeJwtPayload(
  token: string
): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    const payload = parts[1];
    if (!payload) {
      return null;
    }

    const decoded = Buffer.from(payload, "base64url").toString("utf-8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Check if a token is expired (based on exp claim)
 * @param payload - Decoded JWT payload
 * @returns True if token is expired
 */
export function isTokenExpired(payload: Record<string, unknown>): boolean {
  const exp = payload["exp"];
  if (typeof exp !== "number") {
    return true; // No expiration = invalid
  }

  const now = Math.floor(Date.now() / 1000);
  return exp < now;
}
