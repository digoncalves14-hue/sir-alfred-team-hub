import { z } from "zod";
import { asc, eq, getDb, memberships, users } from "@vision/db";
import { verifyPassword } from "@vision/server";
import { HttpError, json, publicApi, readJson } from "@/lib/api";
import { checkLoginRate, clearLoginFailures, registerLoginFailure, startSession } from "@/lib/auth";

const Body = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

export const POST = publicApi(async (req) => {
  const body = await readJson(req, Body);
  if (!checkLoginRate(body.email)) throw new HttpError(429, "Muitas tentativas. Aguarde alguns minutos.");
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, body.email));
  const ok = user ? await verifyPassword(body.password, user.passwordHash) : false;
  if (!user || !ok) {
    registerLoginFailure(body.email);
    throw new HttpError(401, "E-mail ou senha incorretos.");
  }
  clearLoginFailures(body.email);
  const [m] = await db.select().from(memberships).where(eq(memberships.userId, user.id)).orderBy(asc(memberships.createdAt)).limit(1);
  if (!m) throw new HttpError(403, "Usuário sem organização.");
  await startSession(user.id, m.orgId, req.headers.get("user-agent"));
  return json({ ok: true });
});
