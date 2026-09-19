import { TFile, normalizePath } from "obsidian";
import type { App } from "obsidian";
import { ACCOUNTS_DIR } from "../constants.ts";
import { writeVaultFile } from "./create.ts";

export interface AccountDraft {
  name: string;
  currency: string;
  accountType: string;
  institution: string;
  cardEndings: string[];
  aliases: string[];
  openingBalance: number;
  /** "YYYY-MM-DD", or "" to count every transaction. */
  openingDate: string;
  /** The statement figure the derived balance is measured against. */
  referenceBalance: number | null;
  active: boolean;
  includeInNetWorth: boolean;
}

/** An account is named by its note, so the file name is the name itself. */
export function accountNotePath(name: string): string {
  return `${ACCOUNTS_DIR}/${String(name).trim()}.md`;
}

function yamlList(key: string, values: string[]): string {
  if (!values.length) return `${key}: []`;
  return [`${key}:`, ...values.map((value) => `  - ${JSON.stringify(value)}`)].join("\n");
}

/**
 * The note a new account starts as, written in the shape the template already
 * has, so an account made here and one copied from `Budget/Templates/Account.md`
 * are the same note. Every key is present even when it is empty, because an
 * absent key is harder to find than a blank one when editing by hand.
 */
export function accountNote(draft: AccountDraft): string {
  const lines = [
    "---",
    "type: account",
    `name: ${JSON.stringify(draft.name)}`,
    `currency: ${draft.currency || "EGP"}`,
    `account_type: ${draft.accountType || "bank"}`,
    `institution: ${JSON.stringify(draft.institution)}`,
    yamlList("card_endings", draft.cardEndings),
    yamlList("aliases", draft.aliases),
    `opening_balance: ${draft.openingBalance}`,
    `opening_date: ${JSON.stringify(draft.openingDate)}`,
    `balance:${draft.referenceBalance === null ? "" : ` ${draft.referenceBalance}`}`,
    `active: ${draft.active}`,
    `include_in_net_worth: ${draft.includeInNetWorth}`,
    "tags:",
    "  - finance/account",
    "---",
    "",
    `# ${draft.name}`,
    "",
    "List every digit group the bank uses for this account under `card_endings` — a debit",
    "card, a credit card, and the account number can all belong to one note, and the SMS",
    "parser files a message to this account when it sees any of them.",
    "",
    "`opening_balance` is the balance on `opening_date`. The Budget view derives the current",
    "balance from it plus every transaction since.",
    "",
  ];
  return lines.join("\n");
}

/** Creates the note and answers with its path. An existing note is never overwritten. */
export async function createAccountNote(app: App, draft: AccountDraft): Promise<string> {
  const path = normalizePath(accountNotePath(draft.name));
  if (app.vault.getAbstractFileByPath(path)) throw new Error(`${path} already exists.`);
  await writeVaultFile(app, path, accountNote(draft));
  return path;
}

/**
 * Renames the note and the `name` it carries, and answers with where it landed.
 *
 * The file moves first, so a name whose file is already taken fails before
 * anything has changed. The body is left as it is: it belongs to whoever wrote
 * it, heading and all.
 */
export async function renameAccountNote(app: App, path: string, name: string): Promise<string> {
  const file = app.vault.getAbstractFileByPath(normalizePath(path));
  if (!(file instanceof TFile)) throw new Error(`${path} is not a file.`);

  const wanted = normalizePath(accountNotePath(name));
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
