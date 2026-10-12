import type { Brand } from "./brand.js";
import type { Platform } from "./config.js";
import { MIN_VOICE_SCORE } from "./config.js";
import { runRuleChecks, ruleFailures, type RuleChecks } from "./checks.js";
import { scoreVoice, type VoiceScore } from "./judge.js";

export interface GateResult {
  checks: RuleChecks;
  voice: VoiceScore | null;
  voiceSkipped?: string;
  decision: "pass" | "blocked";
  reasons: string[];
}

// Step 3: cheap rule checks first. Only drafts that pass them are worth a
// Claude call to judge voice.
export async function gate(text: string, platform: Platform, brand: Brand, opts = { judgeVoice: true }): Promise<GateResult> {
  const checks = runRuleChecks(text, platform, brand);
  const reasons = ruleFailures(checks);

  if (reasons.length) {
    return { checks, voice: null, voiceSkipped: "Failed a rule check, so no need to spend a Claude call", decision: "blocked", reasons };
  }
  if (!opts.judgeVoice) {
    return { checks, voice: null, voiceSkipped: "Voice scoring turned off", decision: "pass", reasons };
  }

  try {
    const voice = await scoreVoice(text, platform, brand);
    if (voice.score < MIN_VOICE_SCORE) reasons.push(`Voice score ${voice.score}/5 (needs ${MIN_VOICE_SCORE}): ${voice.reason}`);
    return { checks, voice, decision: reasons.length ? "blocked" : "pass", reasons };
  } catch (err) {
    // If we can't score it, we don't ship it.
    const msg = err instanceof Error ? err.message : String(err);
    return { checks, voice: null, voiceSkipped: msg, decision: "blocked", reasons: [`Couldn't score voice: ${msg}`] };
  }
}
