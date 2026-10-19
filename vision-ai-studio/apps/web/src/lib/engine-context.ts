import "server-only";
import type { EngineContext, Timeline } from "@vision/core";
import { getDb, type Project } from "@vision/db";
import { loadEngineContext } from "@vision/server";

export function engineContext(p: Project, tl: Timeline): Promise<EngineContext> {
  return loadEngineContext(getDb(), p, tl);
}
