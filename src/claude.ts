import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { MODEL } from "./config.js";

const client = new Anthropic();

// Every Claude call goes through here, so a run can report exactly what it spent.
export const usage = { calls: 0, inputTokens: 0, outputTokens: 0 };

export async function askJson<S extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: S;
  effort: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    // If Claude declines, the API retries on a fallback model in the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  });

  usage.calls++;
  usage.inputTokens += res.usage.input_tokens;
  usage.outputTokens += res.usage.output_tokens;

  if (res.stop_reason === "refusal") throw new Error("Claude declined this request");
  if (res.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off (max_tokens)");
  if (!res.parsed_output) throw new Error("Claude's answer didn't match the expected format");
  return res.parsed_output;
}
