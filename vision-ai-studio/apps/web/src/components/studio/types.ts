import type { Timeline } from "@vision/core";
import type { ProjectDetail } from "@/lib/projects";

export type Detail = ProjectDetail;
export type StudioAsset = Detail["assets"][number];

export interface StudioActions {
  /** Grava uma nova timeline (edição direta) como nova versão. */
  commitTimeline: (tl: Timeline, summary: string) => Promise<void>;
  /** Aplica operações estruturadas pelo motor do servidor. */
  runOps: (ops: unknown[], summary?: string) => Promise<{ warnings: string[]; unsupported: Array<{ request: string; reason: string }> } | void>;
  refresh: () => Promise<void>;
  seek: (t: number) => void;
  notify: (msg: string, tone?: "info" | "error" | "success" | "warn") => void;
}
