import type { Brand } from "./brand.js";
import type { Platform } from "./config.js";

// Rule checks are plain code: exact, free, and the same every time.
// Claude is only asked to judge what code can't (voice), in judge.ts.

export interface RuleChecks {
  bannedWords: { pass: boolean; found: string[] };
  theme: { pass: boolean; matched: string[] };
  length: { pass: boolean; chars: number; limit: number };
  // Not a pass/fail check: a person fills these in before posting.
  placeholders: string[];
}

// "game-changer" also catches "game changer" and "gamechanger".
function phraseRegex(phrase: string): RegExp {
  const body = phrase
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/['’]/g, "['’]")
    .replace(/[-\s]+/g, "[-\\s]?");
  return new RegExp(`(^|[^a-z])${body}($|[^a-z])`, "i");
}

export function runRuleChecks(text: string, platform: Platform, brand: Brand): RuleChecks {
  const found = brand.bannedWords.filter((w) => phraseRegex(w).test(text));
  const matched = brand.themes
    .filter((t) => t.keywords.some((k) => phraseRegex(k).test(text)))
    .map((t) => t.name);
  // Count characters the way people do (an emoji is one), not UTF-16 units.
  const chars = [...text].length;
  const limit = brand.lengthLimits[platform];

  return {
    bannedWords: { pass: found.length === 0, found },
    theme: { pass: matched.length > 0, matched },
    length: { pass: chars <= limit, chars, limit },
    placeholders: [...new Set(text.match(/\[[^\]\n]{1,40}\]/g) ?? [])],
  };
}

export function ruleFailures(c: RuleChecks): string[] {
  const reasons: string[] = [];
  if (!c.bannedWords.pass) reasons.push(`Uses banned word(s): ${c.bannedWords.found.join(", ")}`);
  if (!c.theme.pass) reasons.push("Doesn't touch any required theme");
  if (!c.length.pass) reasons.push(`Too long: ${c.length.chars} characters, limit is ${c.length.limit}`);
  return reasons;
}
