import { z } from "zod";
import { EDIT_STYLE_IDS, FORMAT_PRESET_IDS, RESOLUTIONS } from "@vision/core";
import { and, desc, eq, getDb, isNull, brands, projects } from "@vision/db";
import { HttpError, api, json, readJson } from "@/lib/api";
import { projectCardDto } from "@/lib/dto";
import { findTemplate } from "@/lib/templates";

export const GET = api(async (req, { session }) => {
  const db = getDb();
  const status = req.nextUrl.searchParams.get("status");
  const rows = await db
    .select({ p: projects, brandName: brands.name })
    .from(projects)
    .leftJoin(brands, eq(brands.id, projects.brandId))
    .where(and(eq(projects.orgId, session.org.id), isNull(projects.deletedAt), status ? eq(projects.status, status) : undefined))
    .orderBy(desc(projects.updatedAt))
    .limit(200);
  return json({ projects: await Promise.all(rows.map((r) => projectCardDto(r.p, r.brandName))) });
});

const Create = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["ai_video", "editor", "long_to_short"]).default("ai_video"),
  brandId: z.string().uuid().nullable().default(null),
  presets: z.array(z.enum(FORMAT_PRESET_IDS)).min(1).max(9),
  styleId: z.enum(EDIT_STYLE_IDS).nullable().default(null),
  folder: z.string().trim().max(80).nullable().default(null),
  templateId: z.string().max(80).nullable().default(null),
  autopilot: z
    .object({
      command: z.string().trim().min(3).max(4000),
      autoRender: z.boolean().default(true),
      resolution: z.enum(RESOLUTIONS).default("1080p"),
    })
    .nullable()
    .default(null),
});

export const POST = api(async (req, { session }) => {
  const body = await readJson(req, Create);
  const db = getDb();
  let styleId = body.styleId;
  if (body.templateId) {
    const t = await findTemplate(body.templateId, session.org.id);
    if (!t) throw new HttpError(400, "Template inválido.");
    styleId ??= t.config.styleId;
  }
  if (body.brandId) {
    const [b] = await db.select().from(brands).where(and(eq(brands.id, body.brandId), eq(brands.orgId, session.org.id)));
    if (!b) throw new HttpError(400, "Marca inválida.");
    styleId ??= (b.defaultStyleId as typeof styleId) ?? null;
  }
  const [p] = await db
    .insert(projects)
    .values({
      orgId: session.org.id,
      brandId: body.brandId,
      name: body.name,
      kind: body.kind,
      destinations: body.presets,
      primaryPreset: body.presets[0],
      styleId,
      folder: body.folder,
      templateId: body.templateId,
      createdBy: session.user.id,
      autopilot: body.autopilot
        ? { command: body.autopilot.command, presets: body.presets, autoRender: body.autopilot.autoRender, resolution: body.autopilot.resolution, stage: "waiting_analysis" }
        : null,
    })
    .returning();
  return json({ id: p.id }, { status: 201 });
});
