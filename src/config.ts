import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const paths = {
  root,
  posts: join(root, "data", "posts.csv"),
  brand: join(root, "brand.md"),
  nextWeek: join(root, "data", "next-week.md"),
  runs: join(root, "runs.json"),
  evalCases: join(root, "fixtures", "eval-cases.json"),
};

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
export const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";

// A draft needs at least this voice score to reach Slack.
export const MIN_VOICE_SCORE = 4;

export const PLATFORMS = ["linkedin", "x", "instagram"] as const;
export type Platform = (typeof PLATFORMS)[number];
