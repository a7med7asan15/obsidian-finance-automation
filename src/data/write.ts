import { App, TFile, normalizePath } from "obsidian";

/**
 * Every mutation funnels through processFrontMatter, which rewrites only the
 * frontmatter block. The vault syncs to iPhone, so a whole-file write could
 * discard a concurrent edit to the note body.
 */
async function editFrontMatter(
  app: App,
  path: string,
  edit: (frontmatter: Record<string, unknown>) => void,
): Promise<void> {
  const file = app.vault.getAbstractFileByPath(normalizePath(path));
  if (!(file instanceof TFile)) throw new Error(`${path} is not a file.`);
  await app.fileManager.processFrontMatter(file, edit);
}

export async function updateTransaction(
  app: App,
  path: string,
  changes: Record<string, unknown>,
): Promise<void> {
  await editFrontMatter(app, path, (frontmatter) => {
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") delete frontmatter[key];
      else frontmatter[key] = value;
    }
  });
}

export async function setExcluded(
  app: App,
  path: string,
  excluded: boolean,
  reason: string,
  source: "manual" | "rule",
  ruleId = "",
): Promise<void> {
  await updateTransaction(app, path, {
    excluded: excluded ? true : null,
    exclude_reason: excluded ? reason : null,
    exclude_source: excluded ? source : null,
    exclude_rule_id: excluded && ruleId ? ruleId : null,
  });
}

export async function setCategory(app: App, path: string, category: string): Promise<void> {
  await updateTransaction(app, path, { category });
}

export async function updateCategoryNote(
  app: App,
  path: string,
  changes: { color?: string; icon?: string; monthly_budget?: number | null },
): Promise<void> {
  await editFrontMatter(app, path, (frontmatter) => {
    if (changes.color !== undefined) frontmatter.color = changes.color || null;
    if (changes.icon !== undefined) frontmatter.icon = changes.icon || null;
    if (changes.monthly_budget !== undefined) frontmatter.monthly_budget = changes.monthly_budget;
  });
}
