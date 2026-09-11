import { App, TFile, TFolder, normalizePath } from "obsidian";
import { RULES_PATH } from "../constants.ts";
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

export async function loadVaultJson<T>(app: App, path: string, fallback: T): Promise<T> {
  const file = app.vault.getAbstractFileByPath(normalizePath(path));
  if (!(file instanceof TFile)) return fallback;
  try {
    return JSON.parse(await app.vault.cachedRead(file)) as T;
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${(error as Error).message}`);
  }
}

export async function saveVaultJson(app: App, path: string, value: unknown): Promise<void> {
  const normalized = normalizePath(path);
  const slash = normalized.lastIndexOf("/");
  if (slash > 0) await ensureFolder(app, normalized.slice(0, slash));
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const existing = app.vault.getAbstractFileByPath(normalized);
  if (existing instanceof TFile) await app.vault.process(existing, () => content);
  else if (existing) throw new Error(`${normalized} exists but is not a file.`);
  else await app.vault.create(normalized, content);
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
