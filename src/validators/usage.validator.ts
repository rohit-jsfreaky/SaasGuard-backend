import { z } from "zod";

/**
 * Schema for recording usage
 */
export const RecordUsageSchema = z.object({
  amount: z.number().int().min(1, "Amount must be at least 1").default(1),
});

/**
 * Schema for usage feature slug parameter
 */
export const UsageParamsSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  featureSlug: z.string().min(1, "Feature slug is required"),
});

/**
 * Inferred types from schemas
 */
export type RecordUsageInput = z.infer<typeof RecordUsageSchema>;
