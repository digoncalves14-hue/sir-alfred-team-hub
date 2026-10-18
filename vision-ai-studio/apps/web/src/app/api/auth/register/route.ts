import { z } from "zod";
import { randomBytes } from "node:crypto";
import { eq, getDb, memberships, organizations, seedBrandsForOrg, users } from "@vision/db";
import { getConfig, hashPassword } from "@vision/server";
import { HttpError, json, publicApi, readJson } from "@/lib/api";
import { startSession } from "@/lib/auth";

const Body = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(200),
  organization: z.string().trim().min(2).max(100).optional(),
});

export const POST = publicApi(async (req) => {
  if (!getConfig().ALLOW_SIGNUP) throw new HttpError(403, "Cadastro desativado neste servidor.");
  const body = await readJson(req, Body);
  const db = getDb();
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email));
  if (exists) throw new HttpError(409, "Já existe uma conta com este e-mail.");
  const orgName = body.organization ?? `Equipe de ${body.name.split(" ")[0]}`;
  const slug = `${orgName.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "org"}-${randomBytes(3).toString("hex")}`;
  const passwordHash = await hashPassword(body.password);
  const { user, org } = await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ email: body.email, name: body.name, passwordHash }).returning();
    const [org] = await tx.insert(organizations).values({ name: orgName, slug }).returning();
    await tx.insert(memberships).values({ orgId: org.id, userId: user.id, role: "owner" });
    return { user, org };
  });
  await seedBrandsForOrg(db, org.id);
  await startSession(user.id, org.id, req.headers.get("user-agent"));
  return json({ ok: true, user: { id: user.id, name: user.name, email: user.email } }, { status: 201 });
});
