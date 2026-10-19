import { and, eq, getDb, templates } from "@vision/db";
import { api, json, notFound } from "@/lib/api";

export const DELETE = api(async (_req, { session, params }) => {
  if (!/^[0-9a-f-]{36}$/.test(params.id)) throw notFound("Template");
  const rows = await getDb().delete(templates).where(and(eq(templates.id, params.id), eq(templates.orgId, session.org.id))).returning();
  if (!rows.length) throw notFound("Template");
  return json({ ok: true });
});
