CREATE TABLE "evidence" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"work_order_number" text NOT NULL,
	"task_id" text,
	"file_name" text NOT NULL,
	"file_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"sha256_hash" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_organization_id_id_pk" PRIMARY KEY("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_notes" (
	"organization_id" text NOT NULL,
	"number" text NOT NULL,
	"po_number" text NOT NULL,
	"waybill" text DEFAULT '' NOT NULL,
	"dock_location" text DEFAULT 'Dock Bay 02' NOT NULL,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"verified_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goods_receipt_notes_organization_id_number_pk" PRIMARY KEY("organization_id","number"),
	CONSTRAINT "grn_status_ck" CHECK ("goods_receipt_notes"."status" IN ('RECEIVED','DISPUTED'))
);
--> statement-breakpoint
CREATE TABLE "pm_rules" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"title" text NOT NULL,
	"asset_code" text NOT NULL,
	"interval_days" integer DEFAULT 90 NOT NULL,
	"priority" text DEFAULT 'P2' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"last_generated_at" timestamp with time zone,
	"next_due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pm_rules_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "pm_rules_status_ck" CHECK ("pm_rules"."status" IN ('ACTIVE','PAUSED')),
	CONSTRAINT "pm_rules_priority_ck" CHECK ("pm_rules"."priority" IN ('P1','P2','P3'))
);
--> statement-breakpoint
CREATE TABLE "po_line_items" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"document_number" text NOT NULL,
	"sku" text NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "po_line_items_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "po_line_qty_ck" CHECK ("po_line_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sensor_readings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sensor_readings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"asset_code" text NOT NULL,
	"sensor_type" text NOT NULL,
	"value" text NOT NULL,
	"unit" text NOT NULL,
	"status" text DEFAULT 'NORMAL' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sensor_status_ck" CHECK ("sensor_readings"."status" IN ('NORMAL','WARNING','CRITICAL'))
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"plan" text DEFAULT 'ENTERPRISE' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sub_plan_ck" CHECK ("subscriptions"."plan" IN ('COMMUNITY','GROWTH','ENTERPRISE')),
	CONSTRAINT "sub_status_ck" CHECK ("subscriptions"."status" IN ('ACTIVE','TRIALING','PAST_DUE','CANCELED'))
);
--> statement-breakpoint
CREATE TABLE "wo_tasks" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"work_order_number" text NOT NULL,
	"step_order" integer NOT NULL,
	"title" text NOT NULL,
	"instruction" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"requires_photo" boolean DEFAULT false NOT NULL,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wo_tasks_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "wo_tasks_status_ck" CHECK ("wo_tasks"."status" IN ('LOCKED','PENDING','IN_PROGRESS','DONE'))
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "prev_hash" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "entry_hash" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan" text DEFAULT 'ENTERPRISE' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_rules" ADD CONSTRAINT "pm_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_line_items" ADD CONSTRAINT "po_line_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensor_readings" ADD CONSTRAINT "sensor_readings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_tasks" ADD CONSTRAINT "wo_tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_wo_idx" ON "evidence" USING btree ("organization_id","work_order_number");--> statement-breakpoint
CREATE INDEX "grn_po_idx" ON "goods_receipt_notes" USING btree ("organization_id","po_number");--> statement-breakpoint
CREATE INDEX "pm_rules_asset_idx" ON "pm_rules" USING btree ("organization_id","asset_code");--> statement-breakpoint
CREATE INDEX "po_lines_doc_idx" ON "po_line_items" USING btree ("organization_id","document_number");--> statement-breakpoint
CREATE INDEX "sensor_readings_asset_idx" ON "sensor_readings" USING btree ("organization_id","asset_code","recorded_at");--> statement-breakpoint
CREATE INDEX "wo_tasks_wo_idx" ON "wo_tasks" USING btree ("organization_id","work_order_number");