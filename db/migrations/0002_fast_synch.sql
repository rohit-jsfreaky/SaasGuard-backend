ALTER TABLE "features" DROP CONSTRAINT "features_slug_unique";--> statement-breakpoint
ALTER TABLE "features" ADD COLUMN "organization_id" bigint NOT NULL;--> statement-breakpoint
CREATE INDEX "features_org_idx" ON "features" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "features_org_slug_unique" ON "features" USING btree ("organization_id","slug");