/**
 * Driver S3 contra um endpoint real/simulado. Roda só com S3_TEST_ENDPOINT definido
 * (ex.: MinIO ou moto: S3_TEST_ENDPOINT=http://127.0.0.1:5005).
 */
import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { resetConfig } from "../src/config";
import { S3Storage } from "../src/storage/s3";
import { makeStorageKey } from "../src/storage/keys";

const endpoint = process.env.S3_TEST_ENDPOINT;

describe.skipIf(!endpoint)("armazenamento S3", () => {
  let storage: S3Storage;
  beforeAll(async () => {
    Object.assign(process.env, {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://unused",
      STORAGE_DRIVER: "s3",
      S3_ENDPOINT: endpoint,
      S3_BUCKET: "vision-test",
      S3_ACCESS_KEY_ID: "test",
      S3_SECRET_ACCESS_KEY: "test",
      S3_REGION: "us-east-1",
      MULTIPART_PART_MB: "5",
    });
    resetConfig();
    const c = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "test", secretAccessKey: "test" } });
    await c.send(new CreateBucketCommand({ Bucket: "vision-test" })).catch(() => {});
    storage = new S3Storage();
  });

  it("upload pela aplicação (multipart), download assinado com Range, materialização e exclusão", async () => {
    const key = makeStorageKey("11111111-1111-4111-8111-111111111111", "sources", "mp4");
    const target = await storage.createUpload(key, "video/mp4", 12 * 1024 * 1024);
    expect(target.mode).toBe("single");
    expect(target.mode === "single" && target.url.startsWith("/api/storage/upload?")).toBe(true);
    const data = randomBytes(12 * 1024 * 1024);
    async function* chunks() {
      for (let i = 0; i < data.length; i += 1024 * 1024) yield data.subarray(i, i + 1024 * 1024);
    }
    expect(await storage.writeStream(key, chunks(), data.length, "video/mp4")).toBe(data.length);
    expect((await storage.stat(key))?.size).toBe(data.length);
    const url = await storage.getDownloadUrl(key, { downloadName: "vídeo final.mp4" });
    const res = await fetch(url, { headers: { Range: "bytes=0-99" } });
    expect(res.status).toBe(206);
    expect(Buffer.from(await res.arrayBuffer()).equals(data.subarray(0, 100))).toBe(true);
    const f = await storage.materialize(key, os.tmpdir());
    expect((await readFile(f.path)).equals(data)).toBe(true);
    await f.cleanup();
    await storage.delete(key);
    expect(await storage.stat(key)).toBeNull();
  });

  it("rejeita upload maior que o declarado", async () => {
    const key = makeStorageKey("11111111-1111-4111-8111-111111111111", "sources", "mp4");
    async function* big() {
      yield randomBytes(2048);
    }
    await expect(storage.writeStream(key, big(), 1000, "video/mp4")).rejects.toThrow(/maior/);
  });
});
