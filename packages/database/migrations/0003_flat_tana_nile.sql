CREATE TABLE "llm_model_routes" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_model_id" uuid NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"upstream_model_id" uuid NOT NULL,
	"weight" integer DEFAULT 100 NOT NULL,
	CONSTRAINT "llm_model_routes_binding_unique" UNIQUE("platform_model_id","upstream_model_id"),
	CONSTRAINT "llm_model_routes_routing_values_check" CHECK ("llm_model_routes"."priority" >= 0 and "llm_model_routes"."weight" >= 0 and "llm_model_routes"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "llm_platform_models" (
	"capability" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text,
	"display_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"public" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"system_prompt" text,
	"task" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_platform_models_key_unique" UNIQUE("key"),
	CONSTRAINT "llm_platform_models_key_length_check" CHECK (char_length("llm_platform_models"."key") between 1 and 160),
	CONSTRAINT "llm_platform_models_display_name_length_check" CHECK (char_length("llm_platform_models"."display_name") between 1 and 200),
	CONSTRAINT "llm_platform_models_description_length_check" CHECK ("llm_platform_models"."description" is null or char_length("llm_platform_models"."description") <= 2000),
	CONSTRAINT "llm_platform_models_system_prompt_length_check" CHECK ("llm_platform_models"."system_prompt" is null or char_length("llm_platform_models"."system_prompt") <= 50000),
	CONSTRAINT "llm_platform_models_task_check" CHECK ("llm_platform_models"."task" in ('chat', 'audio', 'image.generate', 'image.edit', 'video.generate')),
	CONSTRAINT "llm_platform_models_revision_check" CHECK ("llm_platform_models"."revision" >= 0 and "llm_platform_models"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "llm_upstream_models" (
	"capability" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_name" text NOT NULL,
	"protocol" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"upstream_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_upstream_models_identity_unique" UNIQUE("upstream_id","model_name","protocol"),
	CONSTRAINT "llm_upstream_models_name_length_check" CHECK (char_length("llm_upstream_models"."model_name") between 1 and 300),
	CONSTRAINT "llm_upstream_models_protocol_check" CHECK ("llm_upstream_models"."protocol" in ('openai_responses', 'openai_chat_completions', 'openrouter_chat_completions', 'openrouter_responses', 'anthropic_messages', 'google_generate_content', 'google_image_generation', 'gemini_interactions', 'xai_responses', 'openai_image_generations', 'openai_image_edits', 'xai_image', 'xai_image_edits', 'xai_video', 'openai_video_generations')),
	CONSTRAINT "llm_upstream_models_revision_check" CHECK ("llm_upstream_models"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "llm_upstreams" (
	"allow_private_network" boolean DEFAULT false NOT NULL,
	"base_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"credential_ref" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"provider_family" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_upstreams_name_unique" UNIQUE("name"),
	CONSTRAINT "llm_upstreams_name_length_check" CHECK (char_length("llm_upstreams"."name") between 1 and 160),
	CONSTRAINT "llm_upstreams_base_url_length_check" CHECK (char_length("llm_upstreams"."base_url") between 1 and 2048),
	CONSTRAINT "llm_upstreams_provider_family_check" CHECK ("llm_upstreams"."provider_family" in ('openai', 'anthropic', 'google', 'xai', 'openrouter', 'openai-compatible', 'vercel-ai-gateway')),
	CONSTRAINT "llm_upstreams_revision_check" CHECK ("llm_upstreams"."revision" >= 0 and "llm_upstreams"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "llm_model_routes" ADD CONSTRAINT "llm_model_routes_platform_model_id_llm_platform_models_id_fk" FOREIGN KEY ("platform_model_id") REFERENCES "public"."llm_platform_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_model_routes" ADD CONSTRAINT "llm_model_routes_upstream_model_id_llm_upstream_models_id_fk" FOREIGN KEY ("upstream_model_id") REFERENCES "public"."llm_upstream_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_upstream_models" ADD CONSTRAINT "llm_upstream_models_upstream_id_llm_upstreams_id_fk" FOREIGN KEY ("upstream_id") REFERENCES "public"."llm_upstreams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_model_routes_resolution_idx" ON "llm_model_routes" USING btree ("platform_model_id","enabled","priority");--> statement-breakpoint
CREATE INDEX "llm_platform_models_visible_sort_idx" ON "llm_platform_models" USING btree ("enabled","public","sort_order");--> statement-breakpoint
CREATE INDEX "llm_upstream_models_upstream_enabled_idx" ON "llm_upstream_models" USING btree ("upstream_id","enabled");--> statement-breakpoint
CREATE INDEX "llm_upstreams_enabled_sort_idx" ON "llm_upstreams" USING btree ("enabled","sort_order");