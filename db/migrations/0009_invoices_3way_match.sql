CREATE TABLE "invoice_line_items" (
	"organization_id" text NOT NULL,
	"id" text NOT NULL,
	"invoice_number" text NOT NULL,
	"sku" text NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_line_items_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "inv_line_qty_ck" CHECK ("invoice_line_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"organization_id" text NOT NULL,
	"number" text NOT NULL,
	"po_number" text NOT NULL,
	"vendor_slug" text DEFAULT '' NOT NULL,
	"invoice_date" date NOT NULL,
	"due_date" date,
	"payment_terms" text DEFAULT 'NET_30' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"payment_hold" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_organization_id_number_pk" PRIMARY KEY("organization_id","number"),
	CONSTRAINT "inv_number_ck" CHECK ("invoices"."number" ~ '^INV-[0-9]{4}-[0-9]{4}$'),
	CONSTRAINT "inv_status_ck" CHECK ("invoices"."status" IN ('PENDING','MATCHED','DISPUTED'))
);
--> statement-breakpoint
ALTER TABLE "goods_receipt_notes" ADD COLUMN "sku_received" text;--> statement-breakpoint
ALTER TABLE "goods_receipt_notes" ADD COLUMN "qty_received" integer;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inv_lines_inv_idx" ON "invoice_line_items" USING btree ("organization_id","invoice_number");--> statement-breakpoint
CREATE INDEX "invoices_po_idx" ON "invoices" USING btree ("organization_id","po_number");--> statement-breakpoint
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "grn_qty_ck" CHECK ("goods_receipt_notes"."qty_received" IS NULL OR "goods_receipt_notes"."qty_received" > 0);