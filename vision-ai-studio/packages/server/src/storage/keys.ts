import { randomUUID } from "node:crypto";

const SAFE_EXT = /^[a-z0-9]{1,8}$/;

/** Chaves de armazenamento são sempre geradas pelo servidor — nunca a partir do nome enviado. */
export function makeStorageKey(orgId: string, folder: string, ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, "");
  return `orgs/${orgId}/${folder}/${randomUUID()}${SAFE_EXT.test(e) ? `.${e}` : ""}`;
}

export function isSafeKey(key: string): boolean {
  return /^orgs\/[0-9a-f-]{36}\/[a-z0-9_-]+\/[0-9a-f-]{36}(\.[a-z0-9]{1,8})?$/.test(key);
}
