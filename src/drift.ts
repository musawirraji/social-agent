import { paths } from "./config.js";
import { readRuns } from "./runlog.js";

// Shows whether output quality is slipping across runs.
// Voice drift shows up here weeks before anyone notices it on the feed.

const runs = readRuns(paths.runs).filter((r) => r.status === "ok" && r.totals);
if (!runs.length) {
  console.log("No successful runs in runs.json yet. Run npm start first.");
  process.exit(0);
}

console.log("Run              Avg voice        Pass rate   Brand file");
let lastBrand = "";
for (const r of runs) {
  const t = r.totals!;
  const avg = t.avgVoice ?? 0;
  const bar = "█".repeat(Math.round(avg * 2)).padEnd(10, "·");
  const passRate = `${Math.round((t.passed / t.drafted) * 100)}%`.padStart(4);
  const brandNote = lastBrand && r.inputs.brandSha !== lastBrand ? "changed" : "";
  lastBrand = r.inputs.brandSha;
  console.log(`${r.id}  ${bar} ${t.avgVoice?.toFixed(2) ?? " n/a"}   ${passRate}        ${brandNote}`);
}

// Alert if the latest run is clearly worse than the ones before it.
const latest = runs.at(-1)!.totals!;
const prior = runs.slice(-4, -1).map((r) => r.totals!).filter((t) => t.avgVoice !== null);
const warnings: string[] = [];
if (prior.length) {
  const priorAvg = prior.reduce((s, t) => s + t.avgVoice!, 0) / prior.length;
  if (latest.avgVoice !== null && priorAvg - latest.avgVoice >= 0.5) {
    warnings.push(`Voice score dropped from ${priorAvg.toFixed(2)} to ${latest.avgVoice.toFixed(2)}. Check brand.md and recent drafts.`);
  }
}
if (latest.passed / latest.drafted < 0.6) warnings.push(`Only ${latest.passed} of ${latest.drafted} drafts passed in the latest run.`);

console.log(warnings.length ? `\n\x1b[31m⚠ ${warnings.join("\n⚠ ")}\x1b[0m` : "\n\x1b[32mNo drift detected.\x1b[0m");

// Most common reasons drafts were blocked, across all runs.
const reasons = new Map<string, number>();
for (const r of runs) for (const d of r.drafts) for (const reason of d.reasons) {
  const key = reason.split(":")[0];
  reasons.set(key, (reasons.get(key) ?? 0) + 1);
}
if (reasons.size) {
  console.log("\nWhy drafts get blocked (all runs):");
  for (const [k, n] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  ${n}× ${k}`);
}
