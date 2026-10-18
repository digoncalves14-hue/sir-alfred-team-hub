import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, getDb, organizations, sessions, users } from "@vision/db";
import { hashToken } from "@vision/server";

export const SESSION_COOKIE = "vision_session";
export const SESSION_DAYS = 30;

export interface SessionInfo {
  sessionId: string;
  user: { id: string; email: string; name: string };
  org: { id: string; name: string; slug: string };
}

export async function getSession(): Promise<SessionInfo | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 200) return null;
  const db = getDb();
  const id = hashToken(token);
  const rows = await db
    .select({ s: sessions, u: users, o: organizations })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(organizations, eq(organizations.id, sessions.orgId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    sessionId: r.s.id,
    user: { id: r.u.id, email: r.u.email, name: r.u.name },
    org: { id: r.o.id, name: r.o.name, slug: r.o.slug },
  };
}

/** Para páginas (Server Components): redireciona para o login sem sessão. */
export async function requireSession(): Promise<SessionInfo> {
  const s = await getSession();
  if (!s) redirect("/entrar");
  return s;
}
