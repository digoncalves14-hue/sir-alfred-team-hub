import "server-only";
import { cookies } from "next/headers";
import { getDb, sessions } from "@vision/db";
import { getConfig, newSessionToken } from "@vision/server";
import { SESSION_COOKIE, SESSION_DAYS } from "./session";

export async function startSession(userId: string, orgId: string, userAgent: string | null) {
  const { token, id } = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await getDb().insert(sessions).values({ id, userId, orgId, expiresAt, userAgent: userAgent?.slice(0, 300) ?? null });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getConfig().APP_URL.startsWith("https://"),
    path: "/",
    expires: expiresAt,
  });
}

/** Limite simples de tentativas de login por e-mail (memória do processo). */
const attempts = new Map<string, { count: number; until: number }>();
export function checkLoginRate(key: string): boolean {
  const now = Date.now();
  const a = attempts.get(key);
  if (a && a.until > now && a.count >= 8) return false;
  return true;
}
export function registerLoginFailure(key: string) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.until < now) attempts.set(key, { count: 1, until: now + 10 * 60_000 });
  else a.count++;
}
export function clearLoginFailures(key: string) {
  attempts.delete(key);
}
