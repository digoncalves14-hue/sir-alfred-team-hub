import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, newSessionToken, hashToken } from "../src/auth-crypto";
import { signedLocalUrl, verifyLocalUrl } from "../src/storage/signing";
import { isSafeKey, makeStorageKey } from "../src/storage/keys";
import { friendlyFfmpegError } from "../src/ffmpeg";
import { toProcessingError } from "../src/errors";
import { attachPunctuation } from "../src/transcription";

beforeAll(() => {
  process.env.DATABASE_URL ??= "postgres://unused";
  process.env.APP_SECRET = "unit-test-secret-0123456789abcdef";
});

describe("autenticação", () => {
  it("hash de senha com scrypt verifica e rejeita", async () => {
    const h = await hashPassword("minha senha forte");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("minha senha forte", h)).toBe(true);
    expect(await verifyPassword("outra", h)).toBe(false);
  });
  it("token de sessão: só o hash é armazenado", () => {
    const { token, id } = newSessionToken();
    expect(id).toBe(hashToken(token));
    expect(id).not.toContain(token);
  });
});

describe("URLs assinadas e chaves de armazenamento", () => {
  it("assina e valida; adulteração e expiração são rejeitadas", () => {
    const key = makeStorageKey("11111111-1111-4111-8111-111111111111", "sources", "mp4");
    const url = signedLocalUrl("get", key, 60, { dl: "video.mp4" });
    const params = new URL(`http://x${url}`).searchParams;
    expect(verifyLocalUrl("get", params, ["dl"])).toBe(key);
    params.set("dl", "outro.mp4");
    expect(verifyLocalUrl("get", params, ["dl"])).toBeNull();
    const put = new URL(`http://x${signedLocalUrl("put", key, -10, { max: "10" })}`).searchParams;
    expect(verifyLocalUrl("put", put, ["max"])).toBeNull();
  });
  it("chaves são geradas pelo servidor e travessia de diretório é bloqueada", () => {
    const k = makeStorageKey("11111111-1111-4111-8111-111111111111", "logo", "../../etc");
    expect(isSafeKey(k)).toBe(true);
    expect(isSafeKey("orgs/../../etc/passwd")).toBe(false);
  });
});

describe("erros compreensíveis", () => {
  it("traduz falhas do FFmpeg e do sistema", () => {
    expect(friendlyFfmpegError("moov atom not found")).toMatch(/corrompido/);
    expect(toProcessingError(Object.assign(new Error("x"), { code: "ENOSPC" })).retryable).toBe(true);
  });
});

describe("transcrição", () => {
  it("recupera pontuação das palavras a partir dos segmentos", () => {
    const words = [
      { text: "Olá", start: 0, end: 0.4 },
      { text: "tudo", start: 0.5, end: 0.8 },
      { text: "bem", start: 0.85, end: 1.1 },
    ];
    attachPunctuation(words, [{ text: "Olá, tudo bem?", start: 0, end: 1.2 }]);
    expect(words.map((w) => w.text)).toEqual(["Olá,", "tudo", "bem?"]);
  });
});

describe("diagnóstico de falha no grafo de filtros", () => {
  it("encontra o filtro citado pelo FFmpeg respeitando aspas e escapes", async () => {
    const { diagnoseFilterFailure } = await import("../src/ffmpeg");
    const graph = "[0:v]format=yuv420p,setsar=1[a];\n[a]split=2[b][c];\n[b]null[d];\n[c]drawtext=text='a\\, b; c',scale=70000:70000[e];\n[d][e]overlay[vout]";
    const stderr = "[Parsed_scale_5 @ 0x1] [IMGUTILS @ 0x2] Picture size 70000x70000 is invalid\n[Parsed_scale_5 @ 0x1] Failed to configure output pad on Parsed_scale_5\nError reinitializing filters!";
    const d = diagnoseFilterFailure(stderr, graph);
    expect(d?.filterText).toBe("scale=70000:70000");
    expect(d?.chain).toContain("drawtext");
    expect(d?.messages[0]).toMatch(/Picture size/);
    expect(diagnoseFilterFailure("sem filtro", graph)).toBeNull();
  });
});
