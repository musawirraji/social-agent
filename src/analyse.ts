import type { Post } from "./csv.js";
import type { Brand } from "./brand.js";
import { runRuleChecks } from "./checks.js";

// Step 1 is plain code. The maths is exact, it costs nothing, and every
// "why" line can be traced back to the numbers.

export interface Finding {
  pattern: string;
  withRate: number;
  withoutRate: number;
  withCount: number;
  withoutCount: number;
}

export interface Analysis {
  postCount: number;
  overallRate: number;
  top: Array<Post & { rate: number }>;
  bottom: Array<Post & { rate: number }>;
  byPlatform: Array<{ platform: string; rate: number; posts: number }>;
  findings: Finding[];
  summary: string;
}

const rate = (posts: Post[]) =>
  posts.reduce((s, p) => s + p.engagement, 0) / Math.max(1, posts.reduce((s, p) => s + p.impressions, 0));
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// Below this many posts on either side, a comparison is noise, so we skip it.
const MIN_SAMPLE = 3;

export function analyse(posts: Post[], brand: Brand): Analysis {
  const scored = posts
    .map((p) => ({ ...p, rate: p.engagement / p.impressions }))
    .sort((a, b) => b.rate - a.rate);

  const byPlatform = [...new Set(posts.map((p) => p.platform))]
    .map((platform) => {
      const group = posts.filter((p) => p.platform === platform);
      return { platform, rate: rate(group), posts: group.length };
    })
    .sort((a, b) => b.rate - a.rate);

  const patterns: Array<[string, (p: Post) => boolean]> = [
    ["Asks the reader a question", (p) => p.text.includes("?")],
    ["Includes a specific number", (p) => /\d/.test(p.text)],
    ["Names a real place or person in our region", (p) => /\b(Cincinnati|Dayton|Ohio|Kentucky|Indiana|Midwest|MidwestCon|Meet [A-Z])/.test(p.text)],
    ["Uses a banned hype word", (p) => !runRuleChecks(p.text, p.platform, brand).bannedWords.pass],
    ["Short (under 100 characters)", (p) => p.text.length < 100],
  ];

  const findings: Finding[] = [];
  for (const [pattern, test] of patterns) {
    const yes = posts.filter(test);
    const no = posts.filter((p) => !test(p));
    if (yes.length < MIN_SAMPLE || no.length < MIN_SAMPLE) continue;
    findings.push({ pattern, withRate: rate(yes), withoutRate: rate(no), withCount: yes.length, withoutCount: no.length });
  }
  findings.sort((a, b) => Math.abs(b.withRate - b.withoutRate) - Math.abs(a.withRate - a.withoutRate));

  const top = scored.slice(0, 3);
  const bottom = scored.slice(-3).reverse();

  const lines = [
    `${posts.length} posts, overall engagement rate ${pct(rate(posts))}.`,
    "",
    "Best performers:",
    ...top.map((p, i) => `${i + 1}. ${pct(p.rate)} on ${p.platform}: "${p.text}"`),
    "",
    "Worst performers:",
    ...bottom.map((p, i) => `${i + 1}. ${pct(p.rate)} on ${p.platform}: "${p.text}"`),
    "",
    "By platform: " + byPlatform.map((b) => `${b.platform} ${pct(b.rate)} (${b.posts} posts)`).join(", "),
    "",
    "Why (patterns that moved engagement):",
    ...findings.map((f) =>
      `- ${f.pattern}: ${pct(f.withRate)} with (${f.withCount} posts) vs ${pct(f.withoutRate)} without (${f.withoutCount} posts)`,
    ),
    "",
    `Note: ${posts.length} posts is a small sample. Treat these as signals, not proof.`,
  ];

  return { postCount: posts.length, overallRate: rate(posts), top, bottom, byPlatform, findings, summary: lines.join("\n") };
}
