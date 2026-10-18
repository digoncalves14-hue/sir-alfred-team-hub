import { cookies } from "next/headers";
import { eq, getDb, sessions } from "@vision/db";
import { hashToken } from "@vision/server";
import { json, publicApi } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/session";

export const POST = publicApi(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await getDb().delete(sessions).where(eq(sessions.id, hashToken(token)));
  jar.delete(SESSION_COOKIE);
  return json({ ok: true });
});
