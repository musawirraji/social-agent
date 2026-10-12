import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { paths, MODEL, SLACK_WEBHOOK_URL } from "./config.js";
import { readPosts } from "./csv.js";
import { readBrand } from "./brand.js";
import { analyse } from "./analyse.js";
import { draftPosts, nextWeekStart } from "./draft.js";
import { gate } from "./gate.js";
import { postForApproval } from "./slack.js";
import { usage } from "./claude.js";
import { appendRun, sha, type RunRecord } from "./runlog.js";

const args = process.argv.slice(2);
const postsPath = args.find((a) => !a.startsWith("--")) ?? paths.posts;
const sendToSlack = !args.includes("--no-slack");

const c = { bold: "\x1b[1m", dim: "\x1b[2m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", reset: "\x1b[0m" };
const step = (n: number, title: string) => console.log(`\n${c.bold}Step ${n}: ${title}${c.reset}`);

async function main() {
  const run: RunRecord = {
    id: new Date().toISOString().replace(/[-:]/g, "").slice(0, 15),
    startedAt: new Date().toISOString(),
    status: "ok",
    model: MODEL,
    inputs: { postsFile: relative(paths.root, postsPath), postsSha: "", brandSha: "", postCount: 0 },
    drafts: [],
  };

  try {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.");
    if (sendToSlack && !SLACK_WEBHOOK_URL) throw new Error("SLACK_WEBHOOK_URL is not set. Add it to .env, or run with --no-slack.");

    const posts = readPosts(postsPath);
    const brand = readBrand(paths.brand);
    run.inputs.postsSha = sha(readFileSync(postsPath, "utf8"));
    run.inputs.brandSha = sha(brand.raw);
    run.inputs.postCount = posts.length;

    step(1, "What performed best last week, and why");
    const analysis = analyse(posts, brand);
    run.analysis = { overallRate: analysis.overallRate, summary: analysis.summary };
    console.log(c.dim + "(plain code, no AI)" + c.reset + "\n" + analysis.summary);

    step(2, "Drafting next week's posts");
    const weekStart = nextWeekStart(posts.map((p) => p.date));
    run.inputs.weekStart = weekStart;
    console.log(`${c.dim}(Claude, 1 call) Week of ${weekStart}...${c.reset}`);
    const drafts = await draftPosts(brand, analysis, readFileSync(paths.nextWeek, "utf8"), weekStart);

    step(3, "Checking every draft against brand.md");
    console.log(`${c.dim}(rule checks in code; Claude scores voice only for drafts that pass them)${c.reset}`);
    const results = await Promise.all(drafts.map((d) => gate(d.text, d.platform, brand)));

    step(4, sendToSlack ? "Sending passing drafts to Slack" : "Slack skipped (--no-slack)");
    for (const [i, draft] of drafts.entries()) {
      const result = results[i];
      let slack = "not sent (blocked)";
      if (result.decision === "pass") {
        if (!sendToSlack) slack = "skipped";
        else {
          try { await postForApproval(SLACK_WEBHOOK_URL, run.id, draft, result); slack = "posted"; }
          catch (err) { slack = `failed: ${err instanceof Error ? err.message : err}`; }
        }
      }
      run.drafts.push({ ...draft, ...result, slack });
      printDraft(draft.id, draft.platform, draft.date, draft.text, result, slack);
    }

    const passed = results.filter((r) => r.decision === "pass").length;
    const scores = results.flatMap((r) => (r.voice ? [r.voice.score] : []));
    run.totals = {
      drafted: drafts.length,
      passed,
      blocked: drafts.length - passed,
      avgVoice: scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : null,
    };
    console.log(`\n${c.bold}${passed} of ${drafts.length} drafts passed${c.reset}, ${drafts.length - passed} blocked.`);
  } catch (err) {
    run.status = "failed";
    run.error = err instanceof Error ? err.message : String(err);
    console.error(`\n${c.red}Run failed: ${run.error}${c.reset}`);
    process.exitCode = 1;
  } finally {
    run.finishedAt = new Date().toISOString();
    run.claude = { ...usage };
    appendRun(paths.runs, run);
    console.log(`${c.dim}Claude calls: ${usage.calls} · tokens in/out: ${usage.inputTokens}/${usage.outputTokens}`);
    console.log(`Logged as run ${run.id} in runs.json${c.reset}`);
  }
}

function printDraft(id: string, platform: string, date: string, text: string, r: Awaited<ReturnType<typeof gate>>, slack: string) {
  const badge = r.decision === "pass" ? `${c.green}PASS${c.reset}` : `${c.red}BLOCKED${c.reset}`;
  const voice = r.voice ? `voice ${r.voice.score}/5` : "voice not scored";
  console.log(`\n${badge} ${c.bold}${id}${c.reset} ${platform} ${date} · ${voice} · ${r.checks.length.chars}/${r.checks.length.limit} chars · Slack: ${slack}`);
  console.log(c.dim + text.split("\n").map((l) => "  │ " + l).join("\n") + c.reset);
  for (const reason of r.reasons) console.log(`  ${c.red}✗ ${reason}${c.reset}`);
  if (r.checks.placeholders.length) console.log(`  ${c.yellow}⚠ Fill before posting: ${r.checks.placeholders.join(", ")}${c.reset}`);
}

main();
