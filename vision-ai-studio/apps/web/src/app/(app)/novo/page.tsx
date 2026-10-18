import { asc, eq, getDb, inArray, assets, brands } from "@vision/db";
import { capabilities } from "@vision/server";
import { NewProjectWizard } from "@/components/NewProjectWizard";
import { brandDto } from "@/lib/dto";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Novo projeto" };

export default async function Page({ searchParams }: { searchParams: Promise<{ modo?: string }> }) {
  const s = await requireSession();
  const { modo } = await searchParams;
  const db = getDb();
  const rows = await db.select().from(brands).where(eq(brands.orgId, s.org.id)).orderBy(asc(brands.createdAt));
  const logoIds = rows.map((b) => b.logoAssetId).filter(Boolean) as string[];
  const logos = logoIds.length ? await db.select().from(assets).where(inArray(assets.id, logoIds)) : [];
  const caps = capabilities();
  return <NewProjectWizard brands={await Promise.all(rows.map((b) => brandDto(b, logos)))} editorMode={modo === "editor"} capabilities={{ ai: caps.ai, transcription: caps.transcription, maxUploadMb: caps.maxUploadMb }} />;
}
