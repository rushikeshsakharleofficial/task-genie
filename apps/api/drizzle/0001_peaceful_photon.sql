CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid,
	"creator_id" uuid NOT NULL,
	"type" varchar(24) DEFAULT 'email' NOT NULL,
	"title" varchar(240) NOT NULL,
	"subject" varchar(240),
	"body" text DEFAULT '' NOT NULL,
	"audience" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_workspace_status_idx" ON "content_items" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "content_task_idx" ON "content_items" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "content_schedule_idx" ON "content_items" USING btree ("status","scheduled_at");