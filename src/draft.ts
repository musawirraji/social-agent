import { z } from "zod";
import { askJson } from "./claude.js";
import { PLATFORMS } from "./config.js";
import type { Brand } from "./brand.js";
import type { Analysis } from "./analyse.js";

const DraftsSchema = z.object({
  posts: z.array(
    z.object({
      date: z.string().describe("YYYY-MM-DD, a day in the target week"),
      platform: z.enum(PLATFORMS),
      theme: z.string().describe("Which required theme this post serves"),
      text: z.string().describe("The post exactly as it would be published"),
      why: z.string().describe("One sentence: which finding from last week this builds on"),
    }),
  ),
});

export type Draft = z.infer<typeof DraftsSchema>["posts"][number] & { id: string };

// The Monday after the latest post in the CSV.
export function nextWeekStart(dates: string[]): string {
  const latest = new Date(dates.sort().at(-1)! + "T00:00:00Z");
  const daysToMonday = ((8 - latest.getUTCDay()) % 7) || 7;
  latest.setUTCDate(latest.getUTCDate() + daysToMonday);
  return latest.toISOString().slice(0, 10);
}

// Step 2: the one place we need Claude to write.
export async function draftPosts(brand: Brand, analysis: Analysis, nextWeekNotes: string, weekStart: string, count = 5): Promise<Draft[]> {
  const system = [
    "You write social posts for the organisation described in the brand file below.",
    "Follow the brand file exactly: tone rules, banned words, required themes and length limits.",
    "",
    "<brand_file>",
    brand.raw,
    "</brand_file>",
  ].join("\n");

  const prompt = [
    `Draft ${count} posts for the week starting ${weekStart} (Monday).`,
    "Spread them across the week and across linkedin, x and instagram.",
    "Base them on what worked last week. Here is the performance report:",
    "",
    "<performance_report>",
    analysis.summary,
    "</performance_report>",
    "",
    "Here is what's happening next week, with real events and stories you can use:",
    "",
    "<next_week_notes>",
    nextWeekNotes,
    "</next_week_notes>",
    "",
    "Use each story or statistic in at most one post, so the week doesn't repeat itself.",
    "Do not invent statistics, names, dates or venues that aren't in the notes, the report or the brand file.",
    "If a post needs a detail you don't have, write it as a clear placeholder like [speaker name].",
  ].join("\n");

  const out = await askJson({ system, prompt, schema: DraftsSchema, effort: "medium" });
  if (out.posts.length < count) throw new Error(`Claude returned ${out.posts.length} drafts, expected ${count}`);
  return out.posts.slice(0, count).map((p, i) => ({ ...p, id: `d${i + 1}` }));
}
