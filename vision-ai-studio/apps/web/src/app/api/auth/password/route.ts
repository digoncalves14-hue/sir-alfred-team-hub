import { z } from "zod";
import { and, eq, getDb, ne, sessions, users } from "@vision/db";
import { hashPassword, verifyPassword } from "@vision/server";
import { HttpError, api, json, readJson } from "@/lib/api";

const Body = z.object({
  /** Opcional: quem está conectado neste navegador pode definir nova senha mesmo sem lembrar a atual. */
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().min(8, "A nova senha precisa ter pelo menos 8 caracteres.").max(200),
});

/** Troca a senha da conta conectada e encerra todas as outras sessões. */
export const POST = api(async (req, { session }) => {
  const body = await readJson(req, Body);
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, session.user.id));
  if (!u) throw new HttpError(404, "Conta não encontrada.");
  if (body.currentPassword && !(await verifyPassword(body.currentPassword, u.passwordHash))) {
    throw new HttpError(400, "A senha atual não confere. Se você não lembra, deixe o campo em branco.");
  }
  await db.update(users).set({ passwordHash: await hashPassword(body.newPassword) }).where(eq(users.id, u.id));
  const ended = await db
    .delete(sessions)
    .where(and(eq(sessions.userId, u.id), ne(sessions.id, session.sessionId)))
    .returning({ id: sessions.id });
  return json({ ok: true, endedSessions: ended.length });
});
