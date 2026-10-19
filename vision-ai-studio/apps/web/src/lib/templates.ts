import "server-only";
import { SYSTEM_TEMPLATES, TemplateConfig, type TemplateDef } from "@vision/core";
import { and, desc, eq, getDb, templates } from "@vision/db";

export async function listTemplates(orgId: string): Promise<TemplateDef[]> {
  const rows = await getDb().select().from(templates).where(eq(templates.orgId, orgId)).orderBy(desc(templates.createdAt));
  const own = rows.flatMap((r) => {
    const c = TemplateConfig.safeParse(r.config);
    return c.success ? [{ id: r.id, name: r.name, category: r.category, description: r.description, config: c.data, isSystem: false }] : [];
  });
  return [...own, ...SYSTEM_TEMPLATES];
}

export async function findTemplate(id: string, orgId: string): Promise<TemplateDef | null> {
  const sys = SYSTEM_TEMPLATES.find((t) => t.id === id);
  if (sys) return sys;
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [r] = await getDb().select().from(templates).where(and(eq(templates.id, id), eq(templates.orgId, orgId)));
  const c = r ? TemplateConfig.safeParse(r.config) : null;
  return r && c?.success ? { id: r.id, name: r.name, category: r.category, description: r.description, config: c.data, isSystem: false } : null;
}
