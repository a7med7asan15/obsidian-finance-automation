import { TFile, normalizePath } from "obsidian";
import type { App } from "obsidian";
import { CATEGORIES_DIR } from "../constants.ts";
import { writeVaultFile } from "./create.ts";

export interface CategoryDraft {
  name: string;
  currency: string;
  color: string | null;
  icon: string | null;
  monthlyBudget: number | null;
}

/** A category is named by its note, so the file name is the name itself. */
export function categoryNotePath(name: string): string {
  return `${CATEGORIES_DIR}/${String(name).trim()}.md`;
}

/**
 * The note a new category starts as, written in the shape the hand-made ones
 * already have: the frontmatter the index reads, then a heading, so the note
 * is worth opening in Obsidian on its own.
 *
 * `monthly_budget` is always present, empty when there is none, because an
 * absent key is harder to find than a blank one when setting a budget by hand.
 */
export function categoryNote(draft: CategoryDraft): string {
  const lines = [
    "---",
    "type: category",
    `name: ${JSON.stringify(draft.name)}`,
    `currency: ${draft.currency || "EGP"}`,
    `monthly_budget:${draft.monthlyBudget === null ? "" : ` ${draft.monthlyBudget}`}`,
  ];
  if (draft.color) lines.push(`color: "${draft.color}"`);
  if (draft.icon) lines.push(`icon: ${draft.icon}`);
  lines.push("---", "", `# ${draft.name}`, "");
  return lines.join("\n");
}

/** Creates the note and answers with its path. An existing note is never overwritten. */
export async function createCategoryNote(app: App, draft: CategoryDraft): Promise<string> {
  const path = normalizePath(categoryNotePath(draft.name));
  if (app.vault.getAbstractFileByPath(path)) throw new Error(`${path} already exists.`);
  await writeVaultFile(app, path, categoryNote(draft));
  return path;
}

/**
 * Renames the note and the `name` it carries, and answers with where it landed.
 *
 * The file moves first, so a name whose file is already taken fails before
 * anything has changed. The body is left as it is: it belongs to whoever wrote
 * it, heading and all.
 */
export async function renameCategoryNote(app: App, path: string, name: string): Promise<string> {
  const file = app.vault.getAbstractFileByPath(normalizePath(path));
  if (!(file instanceof TFile)) throw new Error(`${path} is not a file.`);

  const wanted = normalizePath(categoryNotePath(name));
  if (wanted !== file.path) {
    if (app.vault.getAbstractFileByPath(wanted)) throw new Error(`${wanted} already exists.`);
    await app.fileManager.renameFile(file, wanted);
  }

  const moved = app.vault.getAbstractFileByPath(wanted);
  if (!(moved instanceof TFile)) throw new Error(`Could not find ${wanted} after renaming.`);
  await app.fileManager.processFrontMatter(moved, (frontmatter: Record<string, unknown>) => {
    frontmatter.name = String(name).trim();
  });
  return wanted;
}

/** Sends the note to the vault's trash, whichever kind the user has chosen. */
export async function deleteCategoryNote(app: App, path: string): Promise<void> {
  const file = app.vault.getAbstractFileByPath(normalizePath(path));
  if (!(file instanceof TFile)) throw new Error(`${path} is not a file.`);
  await app.fileManager.trashFile(file);
}
