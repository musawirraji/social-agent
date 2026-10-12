import { z } from "zod";
import { askJson } from "./claude.js";
import type { Brand } from "./brand.js";
import type { Platform } from "./config.js";

const VoiceSchema = z.object({
  score: z.number().int().describe("1 to 5, using the rubric"),
  reason: z.string().describe("One or two sentences a non-technical reviewer can act on"),
});

export type VoiceScore = z.infer<typeof VoiceSchema>;

const RUBRIC = `Score the post's voice against the brand file's tone rules:
5 = Could publish as-is. Every tone rule followed, specific and warm.
4 = On-brand. Needs at most light polish.
3 = Recognisably us, but generic, or one tone rule bent.
2 = Off-brand: hype, vague, salesy, or fear-of-missing-out.
1 = Contradicts the brand (e.g. AI replacing people, made-up claims).

Banned words, themes and length are checked separately in code. Judge voice only.
Anything in [square brackets] is a placeholder a person fills in before posting.
Judge the post as if each placeholder holds a sensible real detail, and don't lower the score for it.
Be strict. A 4 means you'd be comfortable seeing it published under our name.`;

// Step 3b: a separate, fresh Claude call per draft. The judge never sees how
// the draft was written, so it can't grade its own homework.
export async function scoreVoice(text: string, platform: Platform, brand: Brand): Promise<VoiceScore> {
  const result = await askJson({
    system: `You are a strict brand editor.\n\n<brand_file>\n${brand.raw}\n</brand_file>\n\n${RUBRIC}`,
    prompt: `Platform: ${platform}\n\n<post>\n${text}\n</post>`,
    schema: VoiceSchema,
    effort: "low",
    maxTokens: 4000,
  });
  if (result.score < 1 || result.score > 5) throw new Error(`Voice score out of range: ${result.score}`);
  return result;
}
