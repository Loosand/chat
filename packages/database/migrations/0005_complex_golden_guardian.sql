ALTER TABLE "provider_connections" ADD COLUMN "models" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "provider_connections"
SET "models" = jsonb_build_array(
  jsonb_build_object('modelId', "model_id", 'displayName', "model_id")
);--> statement-breakpoint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_models_check" CHECK (jsonb_typeof("provider_connections"."models") = 'array'
        and jsonb_array_length("provider_connections"."models") between 1 and 1000);
