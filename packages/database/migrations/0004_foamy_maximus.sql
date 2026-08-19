CREATE TABLE "provider_connections" (
	"base_url" text NOT NULL,
	"check_status" text DEFAULT 'unchecked' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"encrypted_credential" text NOT NULL,
	"failure_code" text,
	"id" uuid PRIMARY KEY NOT NULL,
	"last_checked_at" timestamp with time zone,
	"model_id" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"preset" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_connections_preset_check" CHECK ("provider_connections"."preset" in ('anthropic-compatible', 'openai-compatible', 'gemini-compatible', 'grok-compatible', 'deepseek-compatible')),
	CONSTRAINT "provider_connections_check_status_check" CHECK ("provider_connections"."check_status" in ('unchecked', 'connected', 'failed')),
	CONSTRAINT "provider_connections_failure_code_check" CHECK ("provider_connections"."failure_code" is null or "provider_connections"."failure_code" in ('authentication_failed', 'model_not_found', 'rate_limited', 'timeout', 'network_error', 'provider_error')),
	CONSTRAINT "provider_connections_check_result_check" CHECK ((
        "provider_connections"."check_status" = 'unchecked'
        and "provider_connections"."failure_code" is null
        and "provider_connections"."last_checked_at" is null
      ) or (
        "provider_connections"."check_status" = 'connected'
        and "provider_connections"."failure_code" is null
        and "provider_connections"."last_checked_at" is not null
      ) or (
        "provider_connections"."check_status" = 'failed'
        and "provider_connections"."failure_code" is not null
        and "provider_connections"."last_checked_at" is not null
      )),
	CONSTRAINT "provider_connections_lengths_check" CHECK (char_length("provider_connections"."base_url") between 1 and 2048
        and char_length("provider_connections"."model_id") between 1 and 300
        and char_length("provider_connections"."encrypted_credential") between 16 and 32768),
	CONSTRAINT "provider_connections_revision_check" CHECK ("provider_connections"."revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_connections_owner_preset_uidx" ON "provider_connections" USING btree ("owner_id","preset");--> statement-breakpoint
CREATE INDEX "provider_connections_owner_updated_idx" ON "provider_connections" USING btree ("owner_id","updated_at");