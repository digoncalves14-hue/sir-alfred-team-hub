import { capabilities } from "@vision/server";
import { api, json } from "@/lib/api";

export const GET = api(async () => json(capabilities()));
