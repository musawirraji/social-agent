import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Draft } from "./draft.js";
import type { GateResult } from "./gate.js";

export interface RunRecord {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: "ok" | "failed";
  error?: string;
  model: string;
  inputs: { postsFile: string; postsSha: string; brandSha: string; postCount: number; weekStart?: string };
  analysis?: { overallRate: number; summary: string };
  drafts: Array<Draft & GateResult & { slack: "posted" | "skipped" | "not sent (blocked)" | string }>;
  totals?: { drafted: number; passed: number; blocked: number; avgVoice: number | null };
  claude?: { calls: number; inputTokens: number; outputTokens: number };
}

export const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);

export function readRuns(path: string): RunRecord[] {
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8"));
}

// Every run is appended, including failed ones. Nothing is overwritten.
export function appendRun(path: string, run: RunRecord): void {
  const runs = readRuns(path);
  runs.push(run);
  writeFileSync(path, JSON.stringify(runs, null, 2) + "\n");
}
