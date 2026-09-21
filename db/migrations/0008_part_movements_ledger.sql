CREATE TABLE "part_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"sku" text NOT NULL,
	"type" text NOT NULL,
	"qty" integer NOT NULL,
	"ref_number" text,
	"reason" text,
	"actor_user_id" uuid,
	"actor_name" text DEFAULT 'system' NOT NULL,
	"step_up_at" timestamp with time zone,
	"request_id" text,
	"idem_hash" text,
	"before_on_hand" integer NOT NULL,
	"after_on_hand" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "part_movements_type_ck" CHECK ("part_movements"."type" IN ('ISSUE','RECEIVE','ADJUST','RESERVE','RELEASE')),
	CONSTRAINT "part_movements_qty_ck" CHECK ("part_movements"."qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "asset_code" text;--> statement-breakpoint
ALTER TABLE "part_movements" ADD CONSTRAINT "part_movements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "part_movements_org_ts_idx" ON "part_movements" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "part_movements_org_sku_idx" ON "part_movements" USING btree ("organization_id","sku");