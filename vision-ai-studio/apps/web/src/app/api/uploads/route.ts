import path from "node:path";
import { z } from "zod";
import { and, eq, getDb, isNull, assets, brands, projects } from "@vision/db";
import { assertWithinLimits, getConfig, getStorage, makeStorageKey } from "@vision/server";
import { HttpError, api, json, readJson } from "@/lib/api";

const RULES = {
  source: { kind: "video", exts: ["mp4", "mov", "m4v", "webm", "mkv", "avi"], mimePrefix: "video/", maxMb: () => getConfig().MAX_UPLOAD_MB },
  music: { kind: "audio", exts: ["mp3", "wav", "m4a", "aac", "ogg", "flac"], mimePrefix: "audio/", maxMb: () => 300 },
  logo: { kind: "image", exts: ["png", "jpg", "jpeg", "webp"], mimePrefix: "image/", maxMb: () => 20 },
} as const;

const Body = z.object({
  role: z.enum(["source", "music", "logo"]),
  fileName: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  mime: z.string().max(100).default(""),
  projectId: z.string().uuid().nullable().default(null),
  brandId: z.string().uuid().nullable().default(null),
  licenseNote: z.string().trim().max(500).nullable().default(null),
});

/** Inicia um upload direto para o armazenamento (URL assinada; multipart para arquivos grandes). */
export const POST = api(async (req, { session }) => {
  const b = await readJson(req, Body);
  const rule = RULES[b.role];
  const ext = path.extname(b.fileName).slice(1).toLowerCase();
  if (!(rule.exts as readonly string[]).includes(ext)) {
    throw new HttpError(415, `Formato não suportado. Envie: ${rule.exts.join(", ")}.`);
  }
  if (b.mime && !b.mime.startsWith(rule.mimePrefix) && b.mime !== "application/octet-stream") {
    throw new HttpError(415, "Tipo de arquivo não corresponde ao esperado.");
  }
  if (b.sizeBytes > rule.maxMb() * 1024 * 1024) throw new HttpError(413, `Arquivo maior que o limite de ${rule.maxMb()} MB.`);
  if (b.role === "music" && !b.licenseNote) {
    throw new HttpError(400, "Informe a licença ou autorização de uso da música (ex.: \"comprada na biblioteca X\", \"composição própria\").");
  }
  const db = getDb();
  if (b.projectId) {
    const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, b.projectId), eq(projects.orgId, session.org.id), isNull(projects.deletedAt)));
    if (!p) throw new HttpError(404, "Projeto não encontrado.");
  }
  if (b.brandId) {
    const [br] = await db.select({ id: brands.id }).from(brands).where(and(eq(brands.id, b.brandId), eq(brands.orgId, session.org.id)));
    if (!br) throw new HttpError(404, "Marca não encontrada.");
  }
  if (b.role === "source" && !b.projectId) throw new HttpError(400, "Vídeos precisam pertencer a um projeto.");
  await assertWithinLimits(db, session.org.id, "storage", b.sizeBytes);

  const key = makeStorageKey(session.org.id, b.role === "source" ? "sources" : b.role, ext);
  const mime = b.mime || `${rule.mimePrefix}${ext === "jpg" ? "jpeg" : ext}`;
  const target = await getStorage().createUpload(key, mime, b.sizeBytes);
  const [asset] = await db
    .insert(assets)
    .values({
      orgId: session.org.id,
      projectId: b.projectId,
      brandId: b.brandId,
      kind: rule.kind,
      role: b.role,
      originalName: b.fileName.slice(0, 255),
      mime,
      sizeBytes: b.sizeBytes,
      storageKey: key,
      status: "pending_upload",
      uploadSession: target.mode === "multipart" ? { uploadId: target.uploadId } : null,
      licenseNote: b.licenseNote,
      createdBy: session.user.id,
    })
    .returning();
  return json({ assetId: asset.id, target }, { status: 201 });
});
