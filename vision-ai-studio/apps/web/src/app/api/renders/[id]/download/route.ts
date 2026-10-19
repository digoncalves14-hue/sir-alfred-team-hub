import { NextResponse } from "next/server";
import { and, eq, getDb, assets, renders } from "@vision/db";
import { getStorage } from "@vision/server";
import { api, notFound } from "@/lib/api";

/** Download do MP4 (ou SRT) renderizado via URL temporária. */
export const GET = api(async (req, { session, params }) => {
  const db = getDb();
  const [r] = await db.select().from(renders).where(and(eq(renders.id, params.id), eq(renders.orgId, session.org.id)));
  const assetId = req.nextUrl.searchParams.get("file") === "srt" ? r?.srtAssetId : r?.outputAssetId;
  if (!r || !assetId) throw notFound("Arquivo");
  const [a] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!a) throw notFound("Arquivo");
  const url = await getStorage().getDownloadUrl(a.storageKey, { downloadName: a.originalName, expiresSec: 600 });
  return NextResponse.redirect(new URL(url, req.nextUrl.origin), 302);
});
