ALTER TABLE "organization_overrides" ALTER COLUMN "created_by" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "overrides" ALTER COLUMN "created_by" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "user_plans" ALTER COLUMN "assigned_by" SET DATA TYPE varchar(255);