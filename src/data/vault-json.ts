import { TFile, TFolder, normalizePath } from "obsidian";
import type { App } from "obsidian";
import { RULES_PATH } from "../constants.ts";
import { introFor } from "./settings-files.ts";
import { validateRule, type ExclusionRule } from "../domain/exclusion.ts";

export async function ensureFolder(app: App, path: string): Promise<void> {
  const normalized = normalizePath(path);
  if (!normalized || normalized === "/") return;
  let current = "";
  for (const part of normalized.split("/")) {
    current = current ? `${current}/${part}` : part;
    const existing = app.vault.getAbstractFileByPath(current);
    if (!existing) await app.vault.createFolder(current);
    else if (!(existing instanceof TFolder)) throw new Error(`${current} exists but is not a folder.`);
  }
}

/**
 * The data block inside a settings note. The first json fence is the data; any
 * other fence in the prose is an example and is left alone, which is why
 * examples in those notes are written as text fences.
 *
 * The opening run of backticks is captured and required again to close, so a
 * value that itself contains a fence — a keyword someone typed backticks into —
 * is written inside a longer fence and still reads back whole.
 */
const JSON_BLOCK = /(`{3,})json[ \t]*\r?\n([\s\S]*?)\r?\n?\1/;

/** The pre-1.1 spelling of a settings path: `config.md` → `config.json`. */
export function legacyJsonPath(path: string): string {
  return path.endsWith(".md") ? `${path.slice(0, -3)}.json` : path;
}

/**
 * Where a settings file actually is. The note is canonical, but a vault written
 * by an older release still holds the same data in a `.json` file, and that one
 * keeps being read *and* written where it lies: silently moving a user's
 * settings out from under them is worse than living with two spellings.
 */
export function resolveSettingsPath(app: App, path: string): string {
  const note = normalizePath(path);
  if (app.vault.getAbstractFileByPath(note)) return note;
  const legacy = normalizePath(legacyJsonPath(path));
  if (legacy !== note && app.vault.getAbstractFileByPath(legacy)) return legacy;
  return note;
}

/** The JSON a settings file holds, taken from its data block when it is a note. */
export function parseSettingsContent(path: string, content: string): unknown {
  const text = content ?? "";
  if (!path.endsWith(".md")) return JSON.parse(text);
  const block = JSON_BLOCK.exec(text);
  if (block) return JSON.parse(block[2]);
  // A note someone stripped the fence from, leaving bare JSON, still reads.
  if (text.trim().startsWith("{")) return JSON.parse(text);
  throw new Error("it has no ```json block");
}

/**
 * The note with its data block replaced, and every word around it kept — the
 * prose above a block belongs to whoever wrote it, and a save from the UI is
 * not a reason to lose it.
 */
export function withJsonBlock(existing: string, json: string): string {
  const fence = "`".repeat(Math.max(3, longestBacktickRun(json) + 1));
  const fenced = `${fence}json\n${json}\n${fence}`;
  if (!existing.trim()) return `${fenced}\n`;
  if (JSON_BLOCK.test(existing)) return existing.replace(JSON_BLOCK, () => fenced);
  return `${existing.trimEnd()}\n\n${fenced}\n`;
}

function longestBacktickRun(text: string): number {
  let longest = 0;
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return longest;
}

export async function loadVaultJson<T>(app: App, path: string, fallback: T): Promise<T> {
  const resolved = resolveSettingsPath(app, path);
  const file = app.vault.getAbstractFileByPath(resolved);
  if (!(file instanceof TFile)) return fallback;
  try {
    return parseSettingsContent(resolved, await app.vault.cachedRead(file)) as T;
  } catch (error) {
    throw new Error(`Invalid JSON in ${resolved}: ${(error as Error).message}`);
  }
}

export async function saveVaultJson(app: App, path: string, value: unknown): Promise<void> {
  const resolved = resolveSettingsPath(app, path);
  const slash = resolved.lastIndexOf("/");
  if (slash > 0) await ensureFolder(app, resolved.slice(0, slash));
  const json = JSON.stringify(value, null, 2);
  const existing = app.vault.getAbstractFileByPath(resolved);
  if (existing instanceof TFile) {
    // Through `process`, so the prose is re-read and rewritten in one step and
    // a save can never race an edit made in the note itself.
    await app.vault.process(existing, (current) =>
      resolved.endsWith(".md") ? withJsonBlock(current, json) : `${json}\n`,
    );
    return;
  }
  if (existing) throw new Error(`${resolved} exists but is not a file.`);
  // Saving is what creates the file when the folders were never made; it still
  // gets the words that explain it, so it is never an unlabelled blob.
  await app.vault.create(
    resolved,
    resolved.endsWith(".md") ? `${introFor(resolved)}\n${withJsonBlock("", json)}` : `${json}\n`,
  );
}

/**
 * Never throws. A malformed rules file yields zero rules plus an error message,
 * so the UI can offer a repair instead of the plugin failing to load.
 */
export async function loadRules(app: App): Promise<{ rules: ExclusionRule[]; error: string | null }> {
  try {
    const data = await loadVaultJson<{ rules?: unknown }>(app, RULES_PATH, { rules: [] });
    const candidates = Array.isArray(data.rules) ? data.rules : [];
    const rules: ExclusionRule[] = [];
    const problems: string[] = [];
    for (const candidate of candidates) {
      const errors = validateRule(candidate);
      if (errors.length) problems.push(`${(candidate as ExclusionRule)?.id ?? "?"}: ${errors.join(" ")}`);
      else rules.push(candidate as ExclusionRule);
    }
    return { rules, error: problems.length ? problems.join("\n") : null };
  } catch (error) {
    return { rules: [], error: (error as Error).message };
  }
}

export async function saveRules(app: App, rules: ExclusionRule[]): Promise<void> {
  await saveVaultJson(app, RULES_PATH, { rules });
}
