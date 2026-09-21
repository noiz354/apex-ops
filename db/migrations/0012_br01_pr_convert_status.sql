ALTER TABLE "purchase_orders" DROP CONSTRAINT "po_status_ck";
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "po_status_ck" CHECK("purchase_orders"."status" IN ('DRAFT','PENDING_APPROVAL','APPROVED','CONVERTED','DISPATCHED','PARTIAL','RECEIVED','REJECTED','CLOSED'));
