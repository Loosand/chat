CREATE TABLE "chat_run_events" (
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL,
	"run_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	CONSTRAINT "chat_run_events_run_id_sequence_pk" PRIMARY KEY("run_id","sequence"),
	CONSTRAINT "chat_run_events_sequence_check" CHECK ("chat_run_events"."sequence" > 0),
	CONSTRAINT "chat_run_events_type_check" CHECK ("chat_run_events"."type" in ('run.created', 'run.started', 'run.cancel.requested', 'message.checkpoint', 'usage.updated', 'run.completed', 'run.failed', 'run.cancelled', 'run.interrupted'))
);
--> statement-breakpoint
CREATE TABLE "chat_runs" (
	"assistant_message_id" uuid NOT NULL,
	"cancel_requested_at" timestamp with time zone,
	"client_run_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failure" jsonb,
	"finished_at" timestamp with time zone,
	"id" uuid PRIMARY KEY NOT NULL,
	"last_event_sequence" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"requested_model_id" text,
	"route_snapshot" jsonb,
	"started_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"usage" jsonb,
	"user_message_id" uuid NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "chat_runs_client_run_id_length_check" CHECK (char_length("chat_runs"."client_run_id") between 1 and 200),
	CONSTRAINT "chat_runs_owner_id_length_check" CHECK (char_length("chat_runs"."owner_id") between 1 and 128),
	CONSTRAINT "chat_runs_status_check" CHECK ("chat_runs"."status" in ('pending', 'running', 'cancel_requested', 'completed', 'failed', 'cancelled', 'interrupted')),
	CONSTRAINT "chat_runs_version_check" CHECK ("chat_runs"."version" >= 0 and "chat_runs"."last_event_sequence" >= 1),
	CONSTRAINT "chat_runs_distinct_messages_check" CHECK ("chat_runs"."user_message_id" <> "chat_runs"."assistant_message_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"active_leaf_message_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_id_owner_id_unique" UNIQUE("id","owner_id"),
	CONSTRAINT "conversations_title_length_check" CHECK (char_length("conversations"."title") between 1 and 200),
	CONSTRAINT "conversations_owner_id_length_check" CHECK (char_length("conversations"."owner_id") between 1 and 128)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"branch_reason" text NOT NULL,
	"content" jsonb NOT NULL,
	"conversation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_id" uuid,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_conversation_id_id_unique" UNIQUE("conversation_id","id"),
	CONSTRAINT "messages_role_check" CHECK ("messages"."role" in ('system', 'user', 'assistant', 'tool')),
	CONSTRAINT "messages_status_check" CHECK ("messages"."status" in ('pending', 'streaming', 'completed', 'failed', 'cancelled', 'interrupted')),
	CONSTRAINT "messages_branch_reason_check" CHECK ("messages"."branch_reason" in ('initial', 'edit', 'retry', 'continue')),
	CONSTRAINT "messages_parent_not_self_check" CHECK ("messages"."parent_id" is null or "messages"."parent_id" <> "messages"."id")
);
--> statement-breakpoint
ALTER TABLE "chat_run_events" ADD CONSTRAINT "chat_run_events_run_id_chat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."chat_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_runs" ADD CONSTRAINT "chat_runs_conversation_owner_fk" FOREIGN KEY ("conversation_id","owner_id") REFERENCES "public"."conversations"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_runs" ADD CONSTRAINT "chat_runs_conversation_user_message_fk" FOREIGN KEY ("conversation_id","user_message_id") REFERENCES "public"."messages"("conversation_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_runs" ADD CONSTRAINT "chat_runs_conversation_assistant_message_fk" FOREIGN KEY ("conversation_id","assistant_message_id") REFERENCES "public"."messages"("conversation_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_active_leaf_message_id_messages_id_fk" FOREIGN KEY ("active_leaf_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_parent_fk" FOREIGN KEY ("conversation_id","parent_id") REFERENCES "public"."messages"("conversation_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_run_events_at_idx" ON "chat_run_events" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_runs_owner_client_run_uidx" ON "chat_runs" USING btree ("owner_id","client_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_runs_assistant_message_uidx" ON "chat_runs" USING btree ("assistant_message_id");--> statement-breakpoint
CREATE INDEX "chat_runs_conversation_created_idx" ON "chat_runs" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_runs_owner_status_idx" ON "chat_runs" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "conversations_owner_updated_idx" ON "conversations" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_parent_idx" ON "messages" USING btree ("parent_id");