import { createHmac, timingSafeEqual } from "node:crypto";
import { getConfig } from "../config";

/** Assinatura HMAC para URLs temporárias do armazenamento local. */
export function signPayload(parts: string[]): string {
  return createHmac("sha256", getConfig().APP_SECRET).update(parts.join("\n")).digest("base64url");
}

export function verifySignature(parts: string[], sig: string): boolean {
  const expected = Buffer.from(signPayload(parts));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export function signedLocalUrl(op: "get" | "put", key: string, expiresSec: number, extra: Record<string, string> = {}): string {
  const exp = String(Math.floor(Date.now() / 1000) + expiresSec);
  const extraParts = Object.keys(extra)
    .sort()
    .map((k) => `${k}=${extra[k]}`);
  const sig = signPayload([op, key, exp, ...extraParts]);
  const qs = new URLSearchParams({ key, exp, sig, ...extra });
  return `/api/storage/${op === "get" ? "file" : "upload"}?${qs.toString()}`;
}

export function verifyLocalUrl(op: "get" | "put", params: URLSearchParams, extraKeys: string[] = []): string | null {
  const key = params.get("key");
  const exp = params.get("exp");
  const sig = params.get("sig");
  if (!key || !exp || !sig) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  const extraParts = [...extraKeys].sort().map((k) => `${k}=${params.get(k) ?? ""}`);
  return verifySignature([op, key, exp, ...extraParts], sig) ? key : null;
}
