CREATE TABLE "settings_kv" (
	"organization_id" text NOT NULL,
	"key" text NOT NULL,
	"kind" text DEFAULT 'value' NOT NULL,
	"value" text NOT NULL,
	"last4" text,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_kv_organization_id_key_pk" PRIMARY KEY("organization_id","key")
);
--> statement-breakpoint
ALTER TABLE "settings_kv" ADD CONSTRAINT "settings_kv_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;