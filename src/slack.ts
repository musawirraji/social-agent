import type { Draft } from "./draft.js";
import type { GateResult } from "./gate.js";

// Step 4: one message per passing draft, with Approve/Reject buttons.
// Slack sends the button click to n8n (see n8n/slack-approval.json).
export async function postForApproval(webhookUrl: string, runId: string, draft: Draft, result: GateResult): Promise<void> {
  // Everything n8n needs to act on the click, except the post text (Slack caps
  // button values at 2,000 characters), which n8n reads from the "post" block.
  const value = JSON.stringify({
    runId,
    draftId: draft.id,
    platform: draft.platform,
    date: draft.date,
    fillBeforePosting: result.checks.placeholders,
  });
  const body = {
    text: `Draft for ${draft.platform} on ${draft.date} needs approval`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `${label(draft.platform)} · ${weekday(draft.date)} ${draft.date}` } },
      { type: "section", block_id: "post", text: { type: "mrkdwn", text: quote(draft.text) } },
      {
        type: "context",
        elements: [{
          type: "mrkdwn",
          text: `Voice ${result.voice?.score ?? "?"}/5 · ${result.checks.length.chars}/${result.checks.length.limit} chars · Theme: ${result.checks.theme.matched.join(", ")} · Run ${runId}`,
        }],
      },
      ...(result.checks.placeholders.length
        ? [{ type: "section", text: { type: "mrkdwn", text: `:warning: *Fill before posting:* ${result.checks.placeholders.join(", ")}` } }]
        : []),
      { type: "context", elements: [{ type: "mrkdwn", text: `_Why this post:_ ${draft.why}` }] },
      {
        type: "actions",
        block_id: "approval",
        elements: [
          { type: "button", action_id: "approve_draft", style: "primary", text: { type: "plain_text", text: "Approve" }, value },
          { type: "button", action_id: "reject_draft", style: "danger", text: { type: "plain_text", text: "Reject" }, value },
        ],
      },
    ],
  };

  const res = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Slack returned ${res.status}: ${await res.text()}`);
}

const label = (p: string) => ({ linkedin: "LinkedIn", x: "X", instagram: "Instagram" })[p] ?? p;
const weekday = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const quote = (t: string) => t.split("\n").map((l) => `> ${l}`).join("\n");
