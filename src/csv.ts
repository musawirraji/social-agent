import { readFileSync } from "node:fs";
import { PLATFORMS, type Platform } from "./config.js";

export interface Post {
  date: string;
  platform: Platform;
  text: string;
  impressions: number;
  engagement: number;
}

// Splits one CSV line, respecting quoted fields with commas and "" escapes.
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// Reads the posts CSV and fails loudly on anything a person would need to fix.
export function readPosts(path: string): Post[] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const header = splitLine(lines[0]).map((h) => h.trim().toLowerCase());
  const need = ["date", "platform", "text", "impressions", "engagement"];
  const missing = need.filter((n) => !header.includes(n));
  if (missing.length) throw new Error(`posts CSV is missing column(s): ${missing.join(", ")}`);

  return lines.slice(1).map((line, i) => {
    const cells = splitLine(line);
    const row = Object.fromEntries(header.map((h, j) => [h, (cells[j] ?? "").trim()]));
    const platform = row.platform.toLowerCase() as Platform;
    const impressions = Number(row.impressions);
    const engagement = Number(row.engagement);
    const where = `posts CSV row ${i + 2}`;
    if (!PLATFORMS.includes(platform)) throw new Error(`${where}: platform must be one of ${PLATFORMS.join(", ")}, got "${row.platform}"`);
    if (!Number.isFinite(impressions) || impressions <= 0) throw new Error(`${where}: impressions must be a positive number`);
    if (!Number.isFinite(engagement) || engagement < 0) throw new Error(`${where}: engagement must be a number`);
    return { date: row.date, platform, text: row.text, impressions, engagement };
  });
}
