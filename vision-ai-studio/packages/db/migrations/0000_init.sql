CREATE TABLE "ai_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid,
	"text" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"engine" text,
	"model" text,
	"plan" jsonb,
	"reply" text,
	"applied" jsonb,
	"warnings" jsonb,
	"unsupported" jsonb,
	"base_version_id" uuid,
	"result_version_id" uuid,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" double precision,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid,
	"brand_id" uuid,
	"kind" text NOT NULL,
	"role" text NOT NULL,
	"original_name" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"storage_key" text NOT NULL,
	"status" text DEFAULT 'pending_upload' NOT NULL,
	"upload_session" jsonb,
	"probe" jsonb,
	"analysis" jsonb,
	"duration_sec" double precision,
	"width" integer,
	"height" integer,
	"fps" double precision,
	"has_audio" boolean,
	"thumbnail_key" text,
	"license_note" text,
	"error_message" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"segment" text DEFAULT '' NOT NULL,
	"tone" text DEFAULT '' NOT NULL,
	"content_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"colors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fonts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_style_id" text,
	"logo_asset_id" uuid,
	"intro_asset_id" uuid,
	"outro_asset_id" uuid,
	"music_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"presets" jsonb NOT NULL,
	"settings" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid,
	"asset_id" uuid,
	"type" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"progress" double precision DEFAULT 0 NOT NULL,
	"stage" text,
	"priority" integer DEFAULT 100 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"error_code" text,
	"error_message" text,
	"processing_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" text DEFAULT 'mvp' NOT NULL,
	"monthly_ai_budget_usd" double precision,
	"storage_limit_bytes" bigint,
	"monthly_render_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid,
	"name" text NOT NULL,
	"kind" text DEFAULT 'ai_video' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"status_detail" text,
	"error_message" text,
	"destinations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"primary_preset" text DEFAULT 'instagram_reels_9x16' NOT NULL,
	"style_id" text,
	"current_version_id" uuid,
	"thumbnail_key" text,
	"folder" text,
	"autopilot" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "renders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"export_id" uuid,
	"job_id" uuid,
	"kind" text DEFAULT 'export' NOT NULL,
	"preset" text NOT NULL,
	"settings" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" double precision DEFAULT 0 NOT NULL,
	"output_asset_id" uuid,
	"srt_asset_id" uuid,
	"duration_sec" double precision,
	"width" integer,
	"height" integer,
	"size_bytes" bigint,
	"error_message" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"start" double precision NOT NULL,
	"end" double precision NOT NULL,
	"score" double precision,
	"text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"brand_id" uuid,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"config" jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"parent_id" uuid,
	"timeline" jsonb NOT NULL,
	"source" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"ai_command_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"language" text NOT NULL,
	"text" text NOT NULL,
	"words" jsonb NOT NULL,
	"segments" jsonb NOT NULL,
	"duration_sec" double precision,
	"cost_usd" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcripts_asset_id_unique" UNIQUE("asset_id")
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid,
	"kind" text NOT NULL,
	"quantity" double precision NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ai_commands" ADD CONSTRAINT "ai_commands_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_commands" ADD CONSTRAINT "ai_commands_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_commands" ADD CONSTRAINT "ai_commands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_versions" ADD CONSTRAINT "timeline_versions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_versions" ADD CONSTRAINT "timeline_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_versions" ADD CONSTRAINT "timeline_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_commands_project_idx" ON "ai_commands" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "assets_project_idx" ON "assets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "assets_org_idx" ON "assets" USING btree ("org_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_org_slug_uq" ON "brands" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("status","priority","run_after");--> statement-breakpoint
CREATE INDEX "jobs_project_idx" ON "jobs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "projects_org_idx" ON "projects" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE INDEX "renders_project_idx" ON "renders" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "segments_asset_idx" ON "segments" USING btree ("asset_id","kind");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "timeline_versions_project_number_uq" ON "timeline_versions" USING btree ("project_id","number");--> statement-breakpoint
CREATE INDEX "usage_org_idx" ON "usage_events" USING btree ("org_id","created_at");