# social-agent

Reads last week's social posts, works out what performed and why, drafts next week's posts in our brand voice, **blocks any draft that's off-brand**, and sends the rest to Slack so a person can approve or reject them.

```
posts.csv ──► 1. What worked? ──► 2. Draft 5 posts ──► 3. Brand check ──► 4. Slack ──► Approve / Reject ──► ClickUp task
               (plain code)        (Claude)            (code + Claude)      (webhook)      (n8n)               (approved only)
                                                              │
                                                              └──► blocked drafts, with the reason
              every run is logged to runs.json · every human decision to an n8n data table
```

## Who does what

| Job | Done by | Why |
|---|---|---|
| Work out which posts performed best | Code | It's arithmetic. Code is exact, free and gives the same answer every time. |
| Explain *why* (questions, numbers, local stories…) | Code | Each "why" line shows the numbers behind it, so anyone can check it. |
| Write next week's drafts | **Claude** (1 call) | This is the part that needs judgement and good writing. |
| Banned words, required themes, length per platform | Code | Exact rules. A model could miss one; code can't. |
| Does it sound like us? (voice score 1–5) | **Claude** (1 call per draft) | Voice is judgement. A separate call that never saw how the draft was written, so it can't grade its own work. Only runs for drafts that already passed the rules. |
| Post to Slack | Code | A simple webhook. |
| Approve or reject | **A person**, via n8n | Nothing is published without a human saying yes. n8n handles the button click, because it's simple glue that the team can see and change without touching code. |

A typical run makes **at most 6 Claude calls**: 1 to draft, and up to 5 to score voice.

---

## Set up (about 20 minutes, once)

### 1. Install Node.js

Download the **LTS** version from [nodejs.org](https://nodejs.org) and install it like any other app.

### 2. Get the project ready

Open **Terminal**, go to the project folder, and install what it needs:

```bash
cd ~/Desktop/social-agent
```

```bash
npm install
```

Then make your settings file:

```bash
cp .env.example .env
```

Open `.env` in any text editor. You'll fill it in over the next two steps.

### 3. Add your Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com) → **API keys** → **Create key**.
2. Paste it after `ANTHROPIC_API_KEY=` in `.env`.

### 4. Try it without Slack

```bash
npm run start:no-slack
```

You'll see the four steps run, with every draft marked **PASS** or **BLOCKED** and the reason. Nothing is posted anywhere. If this works, the agent is set up.

### 5. Connect Slack and n8n (for Approve/Reject)

Slack buttons need somewhere to send the click. That's n8n.

**a. Import the approval workflow into n8n**

1. In n8n, create a **Data table** called `social_agent_decisions` with these columns: `runId` (String), `draftId` (String), `decision` (String), `by` (String), `at` (Date).
2. **Workflows** → **Import from file** → choose `n8n/slack-approval.json`.
3. Open the **Log decision** node and pick your `social_agent_decisions` table (the file points to the original builder's table).
4. Open the **Create ClickUp task** node, add your ClickUp API token as a credential (in ClickUp: **Settings → Apps → API Token**), and pick the list approved posts should go to (e.g. **Social → Approved posts**).
5. Click the **Slack button clicked** node and copy the **Production URL**.
6. **Publish** the workflow (top right). Publish again after any change, or Slack keeps using the old version.

n8n needs to be reachable from the internet for Slack to reach it. n8n Cloud works out of the box.

**b. Create the Slack app**

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**. Name it `social-agent` and pick your workspace.
2. **Incoming Webhooks** → turn it **On** → **Add New Webhook** → choose the channel where drafts should appear → copy the webhook URL.
3. Paste it after `SLACK_WEBHOOK_URL=` in `.env`.
4. **Interactivity & Shortcuts** → turn it **On** → paste the n8n Production URL into **Request URL** → **Save Changes**.

### 6. Run it for real

```bash
npm start
```

Passing drafts arrive in your Slack channel. Click **Approve** or **Reject** and the message updates to show who decided, and when. The decision is also saved as a row in the `social_agent_decisions` data table in n8n, with the `runId` and `draftId` that link it back to the run in `runs.json`.

Approved posts become a **ClickUp task** with the full post text, anything still to fill in (like a registration link), and the post date as the due date. Whoever publishes works from that list. Rejected posts don't create a task.

### 7. Run it every week automatically (GitHub Actions)

The file `.github/workflows/weekly-drafts.yml` runs the agent every **Monday morning** on GitHub's servers, so nobody needs a terminal.

1. On GitHub, open the repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Add `ANTHROPIC_API_KEY` and `SLACK_WEBHOOK_URL`, with the same values as in your `.env`.

That's it. To run it any time: **Actions** tab → **Weekly social drafts** → **Run workflow**.

Each run first checks the brand checker still works (`npm run eval`), then drafts, then saves `runs.json` back to the repo so the history is kept. To update next week's events or last week's posts, edit `data/next-week.md` or `data/posts.csv` right on GitHub (click the file → pencil icon → **Commit changes**).

If you also run it on your own computer, run `git pull` first so you have the latest `runs.json`.

---

## Everyday use

| I want to… | Do this |
|---|---|
| Run it on this week's real posts | Export your posts as a CSV with the columns `date, platform, text, impressions, engagement`, save it as `data/posts.csv`, then run `npm start` |
| Use a CSV saved somewhere else | `npm start -- path/to/posts.csv` |
| Tell it what's happening next week | Edit `data/next-week.md`: events, dates, venues, stories. The agent only uses facts from here, `brand.md` and last week's posts. |
| Change how we sound | Edit `brand.md`. The writer and the checker both read it, so they stay in step. |
| Ban a new word | Add it under **Banned words** in `brand.md` |
| See if quality is slipping over time | `npm run drift` |
| Check the checker still works | `npm run eval` (free) or `npm run eval:voice` (uses Claude) |

Platforms must be `linkedin`, `x` or `instagram`.

## How the brand check decides

A draft is **blocked** if any of these is true:

- It uses a word from **Banned words** (spelling tricks like "game changer" vs "game-changer" are caught)
- It doesn't touch any **Required theme**
- It's over the **Length limit** for its platform
- Claude's voice score is **below 4 out of 5**
- The voice score couldn't be worked out (if we can't check it, we don't send it)

Every blocked draft shows the reason in the terminal and in `runs.json`.

**Placeholders** like `[date]` or `[venue]` don't block a draft. They're flagged as "Fill before posting" in the terminal and in Slack, so nobody approves a post that's still missing details. The voice judge is told to ignore them, so a draft isn't penalised for something a person will fill in.

## Testing the checker (evals)

`fixtures/eval-cases.json` holds drafts where we already know the right answer: some deliberately off-brand (banned words, too long, hype, "AI replaces staff"), and some that are good. `npm run eval` runs them through the same check the agent uses, and fails if a bad draft gets through or a good one gets blocked.

Run it after any change to `brand.md` or the code. If you spot an off-brand post that got through, add it as a new case so it's caught from then on.

## Watching for drift

Every run is saved in `runs.json`: the input files, the analysis, every draft, every check, every score, and every decision. Nothing is overwritten.

`npm run drift` reads that history and shows the average voice score and pass rate for each run. It warns you if the latest run is clearly worse than the ones before, and flags runs where `brand.md` changed, so you can tell a model problem from a brand change.

## Files

| File | What it is |
|---|---|
| `brand.md` | Our voice: tone rules, banned words, themes, length limits |
| `data/posts.csv` | Last week's posts (15 sample posts included) |
| `data/next-week.md` | Next week's events and stories, the only facts the agent may use |
| `runs.json` | Log of every run (created on the first run, saved back to GitHub by the weekly run) |
| `fixtures/eval-cases.json` | Known-good and known-bad drafts for testing the checker |
| `n8n/slack-approval.json` | The n8n workflow for Approve/Reject |
| `.github/workflows/weekly-drafts.yml` | The weekly schedule and the **Run workflow** button |
| `src/` | The code. `run.ts` is the start; each step has its own file |

## When something goes wrong

| Message | Fix |
|---|---|
| `ANTHROPIC_API_KEY is not set` | Add your key to `.env` (step 3) |
| `SLACK_WEBHOOK_URL is not set` | Add the webhook to `.env` (step 5b), or use `npm run start:no-slack` |
| `posts CSV is missing column(s)` | Check the first row of the CSV has exactly the column names above |
| Buttons in Slack show an error | Check the n8n workflow is **Active** and the Request URL in Slack matches n8n's Production URL |
| `Slack returned 404` | The webhook was removed in Slack. Make a new one (step 5b) |

Failed runs are logged too, with the error, so there's always a record.

## Before relying on this in production

- **Verify Slack's signature** in n8n so only Slack can trigger approvals.
- **Ask for a reason on Reject** and feed the reasons into next week's drafting, so the agent learns from what the team turns down.
- **Stop repeats across weeks** by giving the drafter the last few weeks of approved posts.
- **Keep the repo copy of the workflow in sync**: after changing the workflow in n8n, use **⋯ → Download** and save it over `n8n/slack-approval.json`.
- **Schedule it**: a weekly n8n Schedule trigger or cron job running `npm start`.
- **Connect real data**: swap the CSV for the platforms' analytics exports or APIs.
