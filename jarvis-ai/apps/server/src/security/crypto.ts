/**
 * Criptografia de segredos em repouso (tokens OAuth) e assinatura do "state" do OAuth.
 * AES-256-GCM com chave de 32 bytes (TOKEN_ENCRYPTION_KEY, base64), só no backend.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export class SecretBox {
  private readonly key: Buffer;
  private readonly macKey: Buffer;

  constructor(base64Key: string) {
    let key = Buffer.from(base64Key, "base64");
    // Aceita também segredos longos gerados por provedores (ex.: "Generate" do Render): deriva 32 bytes por SHA-256.
    if (key.length !== 32 && base64Key.length >= 40) key = createHash("sha256").update(base64Key, "utf8").digest();
    if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY deve ter 32 bytes em base64 (gere com: openssl rand -base64 32).");
    this.key = key;
    this.macKey = createHash("sha256").update(Buffer.concat([key, Buffer.from("jarvis-hmac")])).digest();
  }

  /** Retorna "v1.<iv>.<tag>.<ciphertext>" em base64url. */
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
  }

  decrypt(sealed: string): string {
    const [v, iv, tag, data] = sealed.split(".");
    if (v !== "v1" || !iv || !tag || !data) throw new Error("Segredo em formato inválido.");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  }

  sign(payload: string): string {
    return createHmac("sha256", this.macKey).update(payload).digest("base64url");
  }

  verify(payload: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(payload));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
