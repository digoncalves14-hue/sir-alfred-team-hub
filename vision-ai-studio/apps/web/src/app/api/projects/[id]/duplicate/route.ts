import { eq, getDb, projects } from "@vision/db";
import { createVersion, getCurrentVersion } from "@vision/server";
import { api, json } from "@/lib/api";
import { getProjectForOrg } from "@/lib/projects";

/** Duplica o projeto reaproveitando os mesmos arquivos de origem (sem copiar mídia). */
export const POST = api(async (_req, { session, params }) => {
  const p = await getProjectForOrg(params.id, session.org.id);
  const db = getDb();
  const [copy] = await db
    .insert(projects)
    .values({
      orgId: p.orgId,
      brandId: p.brandId,
      name: `${p.name} (cópia)`.slice(0, 120),
      kind: p.kind,
      status: p.status === "draft" ? "draft" : "editing",
      destinations: p.destinations,
      primaryPreset: p.primaryPreset,
      styleId: p.styleId,
      folder: p.folder,
      thumbnailKey: p.thumbnailKey,
      createdBy: session.user.id,
    })
    .returning();
  const current = await getCurrentVersion(db, p);
  if (current) {
    await createVersion(db, { orgId: p.orgId, projectId: copy.id, timeline: current.timeline, source: "initial", summary: `Cópia da versão ${current.version.number} de "${p.name}"`, userId: session.user.id });
  }
  await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, copy.id));
  return json({ id: copy.id }, { status: 201 });
});
