CREATE TABLE "organization_overrides" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organization_id" bigint NOT NULL,
	"feature_slug" varchar(255) NOT NULL,
	"override_type" "override_type" NOT NULL,
	"value" varchar(255),
	"expires_at" timestamp with time zone,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_plans" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"plan_id" bigint NOT NULL,
	"organization_id" bigint,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "user_plans_user_org_unique" UNIQUE("user_id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "plans" DROP CONSTRAINT "plans_slug_unique";--> statement-breakpoint
ALTER TABLE "overrides" ALTER COLUMN "user_id" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "usage" ALTER COLUMN "user_id" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "user_roles" ALTER COLUMN "user_id" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "organization_id" bigint;--> statement-breakpoint
ALTER TABLE "organization_overrides" ADD CONSTRAINT "organization_overrides_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_overrides" ADD CONSTRAINT "organization_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_plans" ADD CONSTRAINT "user_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_plans" ADD CONSTRAINT "user_plans_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_plans" ADD CONSTRAINT "user_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_plans" ADD CONSTRAINT "user_plans_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_overrides_org_id_idx" ON "organization_overrides" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_overrides_feature_slug_idx" ON "organization_overrides" USING btree ("feature_slug");--> statement-breakpoint
CREATE INDEX "org_overrides_expires_at_idx" ON "organization_overrides" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_plans_user_id_idx" ON "user_plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_plans_plan_id_idx" ON "user_plans" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "user_plans_organization_id_idx" ON "user_plans" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plans_organization_id_idx" ON "plans" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_org_slug_unique" UNIQUE("organization_id","slug");