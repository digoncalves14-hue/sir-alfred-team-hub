import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getConfig } from "../config";
import type { StorageDriver, UploadTarget } from "./types";

/**
 * Armazenamento compatível com S3 (AWS S3, Cloudflare R2, MinIO...).
 * O bucket deve ser PRIVADO; todo acesso usa URLs pré-assinadas temporárias.
 * Uploads grandes usam multipart direto do navegador para o bucket
 * (o CORS do bucket precisa expor o cabeçalho ETag).
 */
export class S3Storage implements StorageDriver {
  readonly kind = "s3" as const;
  private client: S3Client;
  /** Cliente usado só para assinar URLs com o endereço público (ex.: MinIO atrás de proxy). */
  private presignClient: S3Client;
  private bucket: string;

  constructor() {
    const c = getConfig();
    if (!c.S3_BUCKET || !c.S3_ACCESS_KEY_ID || !c.S3_SECRET_ACCESS_KEY) {
      throw new Error("Configuração S3 incompleta (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY).");
    }
    const base = {
      region: c.S3_REGION,
      forcePathStyle: c.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: c.S3_ACCESS_KEY_ID, secretAccessKey: c.S3_SECRET_ACCESS_KEY },
    };
    this.client = new S3Client({ ...base, endpoint: c.S3_ENDPOINT });
    this.presignClient = new S3Client({ ...base, endpoint: c.S3_PUBLIC_ENDPOINT ?? c.S3_ENDPOINT });
    this.bucket = c.S3_BUCKET;
  }

  async createUpload(key: string, contentType: string, sizeBytes: number): Promise<UploadTarget> {
    const c = getConfig();
    const partSize = c.MULTIPART_PART_MB * 1024 * 1024;
    const ttl = c.SIGNED_URL_TTL_SEC * 6;
    if (sizeBytes <= partSize) {
      const url = await getSignedUrl(
        this.presignClient,
        new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: sizeBytes }),
        { expiresIn: ttl },
      );
      return { mode: "single", method: "PUT", url, headers: { "Content-Type": contentType } };
    }
    const created = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }));
    const uploadId = created.UploadId!;
    const count = Math.ceil(sizeBytes / partSize);
    if (count > 10_000) throw new Error("Arquivo grande demais para upload multipart.");
    const parts = await Promise.all(
      Array.from({ length: count }, async (_, i) => ({
        partNumber: i + 1,
        url: await getSignedUrl(
          this.presignClient,
          new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumber: i + 1 }),
          { expiresIn: ttl },
        ),
      })),
    );
    return { mode: "multipart", uploadId, partSize, parts };
  }

  async completeUpload(key: string, t: { uploadId?: string; parts?: Array<{ partNumber: number; etag: string }> }): Promise<void> {
    if (t.uploadId) {
      if (!t.parts?.length) throw new Error("Partes do upload não informadas.");
      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: t.uploadId,
          MultipartUpload: { Parts: [...t.parts].sort((a, b) => a.partNumber - b.partNumber).map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
        }),
      );
    }
    if (!(await this.stat(key))) throw new Error("Upload não encontrado no armazenamento.");
  }

  async abortUpload(key: string, uploadId?: string): Promise<void> {
    if (uploadId) await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId })).catch(() => {});
    await this.delete(key).catch(() => {});
  }

  async getDownloadUrl(key: string, opts: { expiresSec?: number; downloadName?: string } = {}): Promise<string> {
    return getSignedUrl(
      this.presignClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: opts.downloadName
          ? `attachment; filename*=UTF-8''${encodeURIComponent(opts.downloadName)}`
          : undefined,
      }),
      { expiresIn: opts.expiresSec ?? getConfig().SIGNED_URL_TTL_SEC },
    );
  }

  async stat(key: string): Promise<{ size: number } | null> {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: Number(r.ContentLength ?? 0) };
    } catch {
      return null;
    }
  }

  async materialize(key: string, tmpDir: string): Promise<{ path: string; cleanup: () => Promise<void> }> {
    await mkdir(tmpDir, { recursive: true });
    const p = path.join(tmpDir, `${randomUUID()}${path.extname(key)}`);
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    await pipeline(r.Body as Readable, createWriteStream(p));
    return { path: p, cleanup: () => rm(p, { force: true }) };
  }

  async uploadFile(localPath: string, key: string, contentType: string): Promise<number> {
    const size = (await stat(localPath)).size;
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: createReadStream(localPath), ContentType: contentType, ContentLength: size }),
    );
    return size;
  }

  async putBuffer(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }));
  }

  async getBuffer(key: string): Promise<Buffer> {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
