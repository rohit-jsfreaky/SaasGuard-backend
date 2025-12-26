import { organizationService } from "../services/organization.service.js";

/**
 * Resolve internal organization ID from mixed identifiers.
 * Accepts numeric strings or Clerk organization IDs and returns the internal numeric ID.
 */
export async function resolveOrganizationId(
  orgIdentifier?: string | null
): Promise<number | null> {
  if (!orgIdentifier) {
    return null;
  }

  const parsed = Number(orgIdentifier);
  if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
    return parsed;
  }

  const organization = await organizationService.getOrganizationByClerkId(
    orgIdentifier
  );
  return organization?.id ?? null;
}
