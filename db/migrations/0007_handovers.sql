CREATE TABLE "handovers" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"shift_from" text NOT NULL,
	"shift_to" text NOT NULL,
	"lead_from" text NOT NULL,
	"lead_to" text NOT NULL,
	"wo_ref" text,
	"items" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reject_reason" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handovers_organization_id_id_pk" PRIMARY KEY("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "handovers_org_status_idx" ON "handovers" USING btree ("organization_id","status");
--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_status_chk" CHECK ("status" IN ('PENDING','ACCEPTED','REJECTED'));
