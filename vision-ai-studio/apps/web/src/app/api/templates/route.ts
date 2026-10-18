import { z } from "zod";
import { TemplateConfig, templateFromTimeline } from "@vision/core";
import { getDb, templates } from "@vision/db";
import { getCurrentVersion } from "@vision/server";
import { HttpError, api, json, readJson } from "@/lib/api";
import { getProjectForOrg } from "@/lib/projects";
import { listTemplates } from "@/lib/templates";

export const GET = api(async (_req, { session }) => json({ templates: await listTemplates(session.org.id) }));

const Body = z.object({
  name: z.string().trim().min(2).max(80),
  category: z.string().trim().min(1).max(40).default("Meus templates"),
  description: z.string().trim().max(300).default(""),
  /** Salva a partir da versão atual de um projeto… */
  fromProjectId: z.string().uuid().optional(),
  /** …ou com uma configuração explícita. */
  config: TemplateConfig.optional(),
  aiGuidance: z.string().trim().max(1000).optional(),
});

export const POST = api(async (req, { session }) => {
  const b = await readJson(req, Body);
  let config = b.config;
  if (!config && b.fromProjectId) {
    const p = await getProjectForOrg(b.fromProjectId, session.org.id);
    const cur = await getCurrentVersion(getDb(), p);
    if (!cur) throw new HttpError(409, "O projeto ainda não tem uma versão para virar template.");
    config = templateFromTimeline(cur.timeline);
  }
  if (!config) throw new HttpError(400, "Informe um projeto de origem ou a configuração do template.");
  if (b.aiGuidance !== undefined) config = { ...config, aiGuidance: b.aiGuidance };
  const [t] = await getDb()
    .insert(templates)
    .values({ orgId: session.org.id, name: b.name, category: b.category, description: b.description, config, isSystem: false })
    .returning();
  return json({ id: t.id }, { status: 201 });
});
