import { getDb } from "@vision/db";
import { getUsageSummary } from "@vision/server";
import { api, json } from "@/lib/api";

export const GET = api(async (_req, { session }) => json(await getUsageSummary(getDb(), session.org.id)));
