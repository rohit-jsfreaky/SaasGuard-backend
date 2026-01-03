import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  index,
  bigint,
} from "drizzle-orm/pg-core";

/**
 * Features table
 * Organization-scoped feature registry
 * Slugs are unique within each organization
 */
export const features = pgTable(
  "features",
  {
    id: serial("id").primaryKey(),
    organizationId: bigint("organization_id", { mode: "number" }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    slugIdx: index("features_slug_idx").on(table.slug),
    orgIdx: index("features_org_idx").on(table.organizationId),
    // Unique slug per organization
    orgSlugUnique: index("features_org_slug_unique").on(
      table.organizationId,
      table.slug
    ),
  })
);

// Relations will be defined separately to avoid circular dependencies
