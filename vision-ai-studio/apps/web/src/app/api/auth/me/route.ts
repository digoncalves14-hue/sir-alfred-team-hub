import { capabilities } from "@vision/server";
import { api, json } from "@/lib/api";

export const GET = api(async (_req, { session }) => json({ user: session.user, org: session.org, capabilities: capabilities() }));
