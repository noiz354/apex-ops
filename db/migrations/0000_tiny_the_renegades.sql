CREATE TABLE "assets" (
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"klass" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"oem" text DEFAULT '' NOT NULL,
	"serial" text DEFAULT '' NOT NULL,
	"health" integer DEFAULT 100 NOT NULL,
	"status" text DEFAULT 'OPERATIONAL' NOT NULL,
	"commissioned_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_organization_id_code_pk" PRIMARY KEY("organization_id","code"),
	CONSTRAINT "assets_health_ck" CHECK ("assets"."health" >= 0 AND "assets"."health" <= 100),
	CONSTRAINT "assets_status_ck" CHECK ("assets"."status" IN ('OPERATIONAL','DEGRADED','DOWN','RETIRED'))
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"actor_name" text DEFAULT 'system' NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"request_id" text
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"organization_id" text NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"severity" text DEFAULT 'MAJOR' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"inspection_number" text,
	"asset_code" text,
	"converted_wo_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "findings_organization_id_number_pk" PRIMARY KEY("organization_id","number"),
	CONSTRAINT "fnd_status_ck" CHECK ("findings"."status" IN ('OPEN','CONVERTED','DISMISSED')),
	CONSTRAINT "fnd_number_ck" CHECK ("findings"."number" ~ '^FND-[0-9]{4}-[0-9]{4}$')
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"organization_id" text NOT NULL,
	"key" text NOT NULL,
	"scope" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_organization_id_key_pk" PRIMARY KEY("organization_id","key")
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"organization_id" text NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"auditor_name" text DEFAULT '' NOT NULL,
	"progress_pct" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'IN_PROGRESS' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspections_organization_id_number_pk" PRIMARY KEY("organization_id","number"),
	CONSTRAINT "ins_progress_ck" CHECK ("inspections"."progress_pct" >= 0 AND "inspections"."progress_pct" <= 100),
	CONSTRAINT "ins_number_ck" CHECK ("inspections"."number" ~ '^INS-[0-9]{4}-[0-9]{4}$')
);
--> statement-breakpoint
CREATE TABLE "mfa_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"organization_id" text NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"bin" text DEFAULT '' NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"min_stock" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parts_organization_id_sku_pk" PRIMARY KEY("organization_id","sku"),
	CONSTRAINT "parts_qty_ck" CHECK ("parts"."on_hand" >= 0 AND "parts"."reserved" >= 0 AND "parts"."min_stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"organization_id" text NOT NULL,
	"number" text NOT NULL,
	"kind" text DEFAULT 'PO' NOT NULL,
	"title" text NOT NULL,
	"vendor_slug" text,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"sla_due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_organization_id_number_pk" PRIMARY KEY("organization_id","number"),
	CONSTRAINT "po_kind_ck" CHECK ("purchase_orders"."kind" IN ('PO','PR')),
	CONSTRAINT "po_status_ck" CHECK ("purchase_orders"."status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','DISPATCHED','PARTIAL','RECEIVED','REJECTED','CLOSED')),
	CONSTRAINT "po_number_ck" CHECK ("purchase_orders"."number" ~ '^(PO|PR)-[0-9]{4}-[0-9]{4}$')
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"organization_id" text NOT NULL,
	"entity" text NOT NULL,
	"year" integer NOT NULL,
	"next_val" integer NOT NULL,
	CONSTRAINT "sequences_organization_id_entity_year_pk" PRIMARY KEY("organization_id","entity","year")
);
--> statement-breakpoint
CREATE TABLE "service_requests" (
	"organization_id" text NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"requester_name" text DEFAULT '' NOT NULL,
	"priority" text DEFAULT 'P3' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"asset_code" text,
	"sla_due_at" timestamp with time zone,
	"converted_wo_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_requests_organization_id_number_pk" PRIMARY KEY("organization_id","number"),
	CONSTRAINT "sr_status_ck" CHECK ("service_requests"."status" IN ('OPEN','TRIAGED','CONVERTED','CLOSED','BREACHED')),
	CONSTRAINT "sr_number_ck" CHECK ("service_requests"."number" ~ '^SR-[0-9]{4}-[0-9]{4}$')
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"initials" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"role" text NOT NULL,
	"password_hash" text NOT NULL,
	"totp_secret" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_ck" CHECK ("users"."role" IN ('Enterprise Admin','Facility Director','Engineering Lead','Senior Field Tech','Vendor Partner Tech','Read-Only Auditor'))
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"organization_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tier" text DEFAULT 'TIER-2' NOT NULL,
	"msa_number" text,
	"msa_expires_on" date,
	"on_time_pct" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_organization_id_slug_pk" PRIMARY KEY("organization_id","slug")
);
--> statement-breakpoint
CREATE TABLE "work_order_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "work_order_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"work_order_number" text NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"actor_name" text DEFAULT 'system' NOT NULL,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"reason" text,
	"request_id" text
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"organization_id" text NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"asset_code" text,
	"location" text DEFAULT '' NOT NULL,
	"priority" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"hold_reason" text,
	"sla_due_at" timestamp with time zone,
	"assigned_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_orders_organization_id_number_pk" PRIMARY KEY("organization_id","number"),
	CONSTRAINT "wo_priority_ck" CHECK ("work_orders"."priority" IN ('P1','P2','P3')),
	CONSTRAINT "wo_status_ck" CHECK ("work_orders"."status" IN ('OPEN','SCHEDULED','DISPATCHED','IN_PROGRESS','ON_HOLD','ESCALATED','COMPLETED','CANCELLED')),
	CONSTRAINT "wo_number_ck" CHECK ("work_orders"."number" ~ '^WO-[0-9]{4}-[0-9]{4}$')
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_events" ADD CONSTRAINT "work_order_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_org_ts_idx" ON "audit_events" USING btree ("organization_id","ts");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_events" USING btree ("organization_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "mfa_user_idx" ON "mfa_challenges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_exp_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "wo_events_org_wo_idx" ON "work_order_events" USING btree ("organization_id","work_order_number");--> statement-breakpoint
CREATE INDEX "wo_org_status_idx" ON "work_orders" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "wo_org_pri_due_idx" ON "work_orders" USING btree ("organization_id","priority","sla_due_at");