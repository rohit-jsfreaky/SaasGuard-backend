import {
  pgTable,
  serial,
  varchar,
  bigint,
  timestamp,
  text,
  index,
  unique,
} from "drizzle-orm/pg-core";

/**
 * API Keys table
 * Stores API keys for external SaaS apps to integrate with SaaS Guard
 * Keys are hashed - the actual key is only shown once on creation
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: serial("id").primaryKey(),

    // Organization this key belongs to
    organizationId: bigint("organization_id", { mode: "number" }).notNull(),

    // SHA256 hash of the actual key
    keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),

    // First 8 chars for display (e.g., "sg_1a2b...")
    keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),

    // Human-readable name for the key
    name: varchar("name", { length: 255 }).notNull(),

    // Scopes: what this key can do (JSON array as text)
    // e.g., ["permissions:read", "usage:write", "users:sync"]
    scopes: text("scopes").default("[]"),

    // Last time this key was used
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),

    // When this key expires (null = never)
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    // Who created this key
    createdBy: bigint("created_by", { mode: "number" }),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    // When revoked (null = active)
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    // Index for fast key lookups
    keyHashIdx: index("api_keys_key_hash_idx").on(table.keyHash),
    // Index for org lookups
    orgIdx: index("api_keys_organization_id_idx").on(table.organizationId),
  })
);

/**
 * Available scopes for API keys
 */
export const API_KEY_SCOPES = {
  PERMISSIONS_READ: "permissions:read",
  USAGE_READ: "usage:read",
  USAGE_WRITE: "usage:write",
  USERS_SYNC: "users:sync",
};

/**
 * Default scopes for new API keys
 */
export const DEFAULT_API_KEY_SCOPES = [
  API_KEY_SCOPES.PERMISSIONS_READ,
  API_KEY_SCOPES.USAGE_WRITE,
  API_KEY_SCOPES.USERS_SYNC,
];
