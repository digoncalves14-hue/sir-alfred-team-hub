import { getConfig } from "../config";
import { LocalStorage } from "./local";
import { S3Storage } from "./s3";
import type { StorageDriver } from "./types";

export * from "./types";
export * from "./keys";
export * from "./signing";
export { LocalStorage } from "./local";
export { S3Storage } from "./s3";

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (!driver) driver = getConfig().STORAGE_DRIVER === "s3" ? new S3Storage() : new LocalStorage();
  return driver;
}
