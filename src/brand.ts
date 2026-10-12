import { readFileSync } from "node:fs";
import type { Platform } from "./config.js";

export interface Theme {
  name: string;
  keywords: string[];
}

export interface Brand {
  raw: string;
  bannedWords: string[];
  themes: Theme[];
  lengthLimits: Record<Platform, number>;
}

// Bullet lines under a "## Heading" until the next heading.
function bullets(md: string, heading: string): string[] {
  const start = md.search(new RegExp(`^##\\s+${heading}\\b.*$`, "im"));
  if (start === -1) throw new Error(`brand.md is missing the "## ${heading}" section`);
  const rest = md.slice(start).split("\n").slice(1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end))
    .filter((l) => l.trim().startsWith("- "))
    .map((l) => l.trim().slice(2).trim());
}

export function readBrand(path: string): Brand {
  const raw = readFileSync(path, "utf8");

  const themes = bullets(raw, "Required themes").map((line) => {
    const [name, words = ""] = line.split(":");
    return { name: name.trim(), keywords: words.split(",").map((w) => w.trim()).filter(Boolean) };
  });

  const limits = Object.fromEntries(
    bullets(raw, "Length limits").map((line) => {
      const [platform, n] = line.split(":");
      return [platform.trim().toLowerCase(), Number(n)];
    }),
  ) as Record<Platform, number>;

  return { raw, bannedWords: bullets(raw, "Banned words"), themes, lengthLimits: limits };
}
