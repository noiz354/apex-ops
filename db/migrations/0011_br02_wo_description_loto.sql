ALTER TABLE "work_orders" ADD COLUMN "description" text;
--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "loto_required" boolean NOT NULL DEFAULT false;
