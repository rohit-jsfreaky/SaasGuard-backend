BEGIN;

-- Drop foreign keys that depend on users.id so we can rewrite identifiers
ALTER TABLE "user_roles" DROP CONSTRAINT IF EXISTS "user_roles_user_id_users_id_fk";
ALTER TABLE "overrides" DROP CONSTRAINT IF EXISTS "overrides_user_id_users_id_fk";
ALTER TABLE "overrides" DROP CONSTRAINT IF EXISTS "overrides_created_by_users_id_fk";
ALTER TABLE "user_plans" DROP CONSTRAINT IF EXISTS "user_plans_user_id_users_id_fk";
ALTER TABLE "user_plans" DROP CONSTRAINT IF EXISTS "user_plans_assigned_by_users_id_fk";
ALTER TABLE "organization_overrides" DROP CONSTRAINT IF EXISTS "organization_overrides_created_by_users_id_fk";
ALTER TABLE "usage" DROP CONSTRAINT IF EXISTS "usage_user_id_users_id_fk";

-- Remove the legacy sequence default from users.id
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT;
DO $$
DECLARE seq_name text;
BEGIN
  SELECT pg_get_serial_sequence('users', 'id') INTO seq_name;
  IF seq_name IS NOT NULL THEN
    EXECUTE format('DROP SEQUENCE IF EXISTS %I', seq_name);
  END IF;
END $$;

-- Preserve the original numeric identifiers for remapping
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "legacy_id" varchar(255);
UPDATE "users" SET "legacy_id" = COALESCE("legacy_id", "id");

-- Move primary key to Clerk IDs
UPDATE "users" SET "id" = "clerk_id";

-- Rewrite dependent tables to the new identifiers
UPDATE "user_roles" ur
SET "user_id" = u."id"
FROM "users" u
WHERE ur."user_id" = u."legacy_id";

UPDATE "overrides" o
SET "user_id" = u."id"
FROM "users" u
WHERE o."user_id" = u."legacy_id";

UPDATE "overrides" o
SET "created_by" = u."id"
FROM "users" u
WHERE o."created_by" = u."legacy_id";

UPDATE "user_plans" up
SET "user_id" = u."id"
FROM "users" u
WHERE up."user_id" = u."legacy_id";

UPDATE "user_plans" up
SET "assigned_by" = u."id"
FROM "users" u
WHERE up."assigned_by" = u."legacy_id";

UPDATE "organization_overrides" oo
SET "created_by" = u."id"
FROM "users" u
WHERE oo."created_by" = u."legacy_id";

UPDATE "usage" us
SET "user_id" = u."id"
FROM "users" u
WHERE us."user_id" = u."legacy_id";

UPDATE "organizations" o
SET "created_by" = u."id"
FROM "users" u
WHERE o."created_by" = u."legacy_id";

-- Remove legacy column now that rewrites are complete
ALTER TABLE "users" DROP COLUMN IF EXISTS "legacy_id";

-- Recreate foreign key constraints with string identifiers
ALTER TABLE "user_roles"
  ADD CONSTRAINT "user_roles_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE "overrides"
  ADD CONSTRAINT "overrides_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE "overrides"
  ADD CONSTRAINT "overrides_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE "user_plans"
  ADD CONSTRAINT "user_plans_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE "user_plans"
  ADD CONSTRAINT "user_plans_assigned_by_users_id_fk"
  FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE "organization_overrides"
  ADD CONSTRAINT "organization_overrides_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE "usage"
  ADD CONSTRAINT "usage_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

COMMIT;
