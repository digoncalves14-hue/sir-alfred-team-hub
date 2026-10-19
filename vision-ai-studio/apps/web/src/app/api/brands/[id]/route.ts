import { z } from "zod";
import { EDIT_STYLE_IDS } from "@vision/core";
import { and, eq, getDb, assets, brands } from "@vision/db";
import { HttpError, api, json, notFound, readJson } from "@/lib/api";
import { assetDto, brandDto } from "@/lib/dto";

async function load(id: string, orgId: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound("Marca");
  const [b] = await getDb().select().from(brands).where(and(eq(brands.id, id), eq(brands.orgId, orgId)));
  if (!b) throw notFound("Marca");
  return b;
}

export const GET = api(async (_req, { session, params }) => {
  const b = await load(params.id, session.org.id);
  const files = await getDb().select().from(assets).where(eq(assets.brandId, b.id));
  return json({ brand: await brandDto(b, files), assets: await Promise.all(files.map(assetDto)) });
});

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (use #RRGGBB).");
const Patch = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  segment: z.string().trim().max(200).optional(),
  tone: z.string().trim().max(200).optional(),
  contentTypes: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  colors: z.array(Hex).max(8).optional(),
  fonts: z.array(z.string().trim().min(1).max(60)).max(4).optional(),
  defaultStyleId: z.enum(EDIT_STYLE_IDS).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  logoAssetId: z.string().uuid().nullable().optional(),
  musicAssetIds: z.array(z.string().uuid()).max(50).optional(),
});

export const PATCH = api(async (req, { session, params }) => {
  const b = await load(params.id, session.org.id);
  const body = await readJson(req, Patch);
  const db = getDb();
  const check = async (id: string, role: string) => {
    const [a] = await db.select().from(assets).where(and(eq(assets.id, id), eq(assets.orgId, session.org.id), eq(assets.role, role)));
    if (!a) throw new HttpError(400, "Arquivo inválido para a marca.");
  };
  if (body.logoAssetId) await check(body.logoAssetId, "logo");
  for (const m of body.musicAssetIds ?? []) await check(m, "music");
  await db.update(brands).set({ ...body, updatedAt: new Date() }).where(eq(brands.id, b.id));
  return json({ ok: true });
});
