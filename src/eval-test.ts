import { readFileSync } from "node:fs";
import { paths, type Platform } from "./config.js";
import { readBrand } from "./brand.js";
import { gate } from "./gate.js";
import { usage } from "./claude.js";

// Tests the eval itself. Each case is a draft where we already know the right
// answer. If the gate lets a bad one through, or blocks a good one, it fails.
//   npm run eval         rule checks only (free, no API key needed)
//   npm run eval:voice   also runs Claude's voice score (uses the API)

interface Case { name: string; platform: Platform; text: string; expect: "pass" | "blocked"; catches?: string; needsVoice?: boolean }

const withVoice = process.argv.includes("--with-voice");
const brand = readBrand(paths.brand);
const cases: Case[] = JSON.parse(readFileSync(paths.evalCases, "utf8"));
const runnable = cases.filter((c) => withVoice || !c.needsVoice);

let failed = 0;
for (const tc of runnable) {
  const r = await gate(tc.text, tc.platform, brand, { judgeVoice: withVoice });
  const ok = r.decision === tc.expect;
  if (!ok) failed++;
  const voice = r.voice ? ` · voice ${r.voice.score}/5` : "";
  console.log(`${ok ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${tc.name}: expected ${tc.expect}, got ${r.decision}${voice}`);
  if (r.reasons.length) console.log(`    ${r.reasons.join("; ")}`);
}

const skipped = cases.length - runnable.length;
console.log(`\n${runnable.length - failed}/${runnable.length} cases correct${skipped ? ` (${skipped} voice cases skipped, run npm run eval:voice)` : ""}`);
if (withVoice) console.log(`Claude calls: ${usage.calls}`);
process.exitCode = failed ? 1 : 0;
