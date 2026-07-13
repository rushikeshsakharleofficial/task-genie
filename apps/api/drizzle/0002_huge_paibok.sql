ALTER TABLE "attachments" ADD COLUMN "scan_status" varchar(20) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "scan_result" varchar(255);--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "scanned_at" timestamp with time zone;--> statement-breakpoint
UPDATE "attachments" SET "quarantined" = true WHERE "scan_status" = 'pending';
