import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("mvp"),
  /** Limites configuráveis por organização (null = usa padrão do ambiente). */
  monthlyAiBudgetUsd: doublePrecision("monthly_ai_budget_usd"),
  storageLimitBytes: bigint("storage_limit_bytes", { mode: "number" }),
  monthlyRenderMinutes: integer("monthly_render_minutes"),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("editor"), // owner | admin | editor | viewer
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 do token do cookie (o token em si nunca é salvo). */
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const brands = pgTable(
  "brands",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    segment: text("segment").notNull().default(""),
    tone: text("tone").notNull().default(""),
    contentTypes: jsonb("content_types").$type<string[]>().notNull().default([]),
    colors: jsonb("colors").$type<string[]>().notNull().default([]),
    fonts: jsonb("fonts").$type<string[]>().notNull().default([]),
    defaultStyleId: text("default_style_id"),
    logoAssetId: uuid("logo_asset_id"),
    introAssetId: uuid("intro_asset_id"),
    outroAssetId: uuid("outro_asset_id"),
    musicAssetIds: jsonb("music_asset_ids").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("brands_org_slug_uq").on(t.orgId, t.slug)],
);

export interface AutopilotConfig {
  command: string;
  presets: string[];
  autoRender: boolean;
  resolution: string;
  stage: "waiting_analysis" | "planning" | "rendering" | "done" | "failed";
  commandId?: string;
}

export const projects = pgTable(
  "projects",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("ai_video"), // ai_video | editor | long_to_short
    status: text("status").notNull().default("draft"),
    statusDetail: text("status_detail"),
    errorMessage: text("error_message"),
    destinations: jsonb("destinations").$type<string[]>().notNull().default([]),
    primaryPreset: text("primary_preset").notNull().default("instagram_reels_9x16"),
    styleId: text("style_id"),
    templateId: text("template_id"),
    parentProjectId: uuid("parent_project_id"),
    currentVersionId: uuid("current_version_id"),
    thumbnailKey: text("thumbnail_key"),
    folder: text("folder"),
    autopilot: jsonb("autopilot").$type<AutopilotConfig | null>(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("projects_org_idx").on(t.orgId, t.updatedAt)],
);

export const assets = pgTable(
  "assets",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // video | audio | image | subtitle
    role: text("role").notNull(), // source | music | logo | vignette | render | thumbnail | srt
    originalName: text("original_name").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    storageKey: text("storage_key").notNull().unique(),
    status: text("status").notNull().default("pending_upload"), // pending_upload | uploaded | processing | ready | error
    uploadSession: jsonb("upload_session").$type<Record<string, unknown> | null>(),
    probe: jsonb("probe").$type<Record<string, unknown> | null>(),
    analysis: jsonb("analysis").$type<Record<string, unknown> | null>(),
    durationSec: doublePrecision("duration_sec"),
    width: integer("width"),
    height: integer("height"),
    fps: doublePrecision("fps"),
    hasAudio: boolean("has_audio"),
    thumbnailKey: text("thumbnail_key"),
    /** Cópia leve (720p H.264, faststart) usada na prévia do estúdio; o original continua sendo a fonte do render. */
    proxyKey: text("proxy_key"),
    licenseNote: text("license_note"),
    errorMessage: text("error_message"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("assets_project_idx").on(t.projectId), index("assets_org_idx").on(t.orgId, t.role)],
);

export const transcripts = pgTable("transcripts", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id").notNull().unique().references(() => assets.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  model: text("model"),
  language: text("language").notNull(),
  text: text("text").notNull(),
  words: jsonb("words").$type<Array<{ text: string; start: number; end: number }>>().notNull(),
  segments: jsonb("segments").$type<Array<{ text: string; start: number; end: number }>>().notNull(),
  durationSec: doublePrecision("duration_sec"),
  costUsd: doublePrecision("cost_usd"),
  createdAt: createdAt(),
});

export const segments = pgTable(
  "segments",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // silence | scene | sound | static | sentence
    start: doublePrecision("start").notNull(),
    end: doublePrecision("end").notNull(),
    score: doublePrecision("score"),
    text: text("text"),
    createdAt: createdAt(),
  },
  (t) => [index("segments_asset_idx").on(t.assetId, t.kind)],
);

export const aiCommands = pgTable(
  "ai_commands",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    text: text("text").notNull(),
    status: text("status").notNull().default("queued"), // queued | running | applied | no_changes | failed
    engine: text("engine"), // anthropic | local-rules
    model: text("model"),
    plan: jsonb("plan"),
    reply: text("reply"),
    applied: jsonb("applied").$type<string[]>(),
    warnings: jsonb("warnings").$type<string[]>(),
    unsupported: jsonb("unsupported").$type<Array<{ request: string; reason: string }>>(),
    baseVersionId: uuid("base_version_id"),
    resultVersionId: uuid("result_version_id"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: doublePrecision("cost_usd"),
    errorMessage: text("error_message"),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("ai_commands_project_idx").on(t.projectId, t.createdAt)],
);

export const timelineVersions = pgTable(
  "timeline_versions",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    parentId: uuid("parent_id"),
    timeline: jsonb("timeline").notNull(),
    source: text("source").notNull(), // initial | ai | manual | restore
    summary: text("summary").notNull().default(""),
    aiCommandId: uuid("ai_command_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("timeline_versions_project_number_uq").on(t.projectId, t.number)],
);

export const templates = pgTable("templates", {
  id: id(),
  orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull().default(""),
  config: jsonb("config").notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: createdAt(),
});

export const contentSuggestions = pgTable(
  "content_suggestions",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    versionId: uuid("version_id"),
    status: text("status").notNull().default("queued"), // queued | running | succeeded | failed
    data: jsonb("data"),
    model: text("model"),
    costUsd: doublePrecision("cost_usd"),
    errorMessage: text("error_message"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("content_project_idx").on(t.projectId, t.createdAt)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").notNull().default("queued"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    result: jsonb("result").$type<Record<string, unknown> | null>(),
    progress: doublePrecision("progress").notNull().default(0),
    stage: text("stage"),
    priority: integer("priority").notNull().default(100),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lockedBy: text("locked_by"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    cancelRequested: boolean("cancel_requested").notNull().default(false),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    processingMs: integer("processing_ms"),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("jobs_claim_idx").on(t.status, t.priority, t.runAfter),
    index("jobs_project_idx").on(t.projectId, t.createdAt),
  ],
);

export const exportsTable = pgTable("exports", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").notNull(),
  presets: jsonb("presets").$type<string[]>().notNull(),
  settings: jsonb("settings").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const renders = pgTable(
  "renders",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").notNull(),
    exportId: uuid("export_id"),
    jobId: uuid("job_id"),
    kind: text("kind").notNull().default("export"), // preview | export
    preset: text("preset").notNull(),
    settings: jsonb("settings").notNull(),
    status: text("status").notNull().default("queued"), // queued | running | succeeded | failed | canceled
    progress: doublePrecision("progress").notNull().default(0),
    outputAssetId: uuid("output_asset_id"),
    srtAssetId: uuid("srt_asset_id"),
    durationSec: doublePrecision("duration_sec"),
    width: integer("width"),
    height: integer("height"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    errorMessage: text("error_message"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("renders_project_idx").on(t.projectId, t.createdAt)],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // ai_tokens | transcription_seconds | render_seconds | analysis_seconds | storage_bytes
    quantity: doublePrecision("quantity").notNull(),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("usage_org_idx").on(t.orgId, t.createdAt)],
);

export type Project = typeof projects.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type Render = typeof renders.$inferSelect;
export type AiCommand = typeof aiCommands.$inferSelect;
export type TimelineVersion = typeof timelineVersions.$inferSelect;
export type User = typeof users.$inferSelect;
