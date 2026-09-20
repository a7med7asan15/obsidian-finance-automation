import { TFile, normalizePath } from "obsidian";
import type { App } from "obsidian";
import {
  ACCOUNTS_DIR,
  CATEGORIES_DIR,
  INBOX_DIR,
  SETTINGS_DIR,
  TRANSACTIONS_DIR,
  VAULT_ROOT,
} from "../constants.ts";
import { accountNote, accountNotePath, type AccountDraft } from "./accounts.ts";
import { categoryNote, categoryNotePath } from "./categories.ts";
import { DEFAULT_CATEGORIES, SETTINGS_FILES } from "./settings-files.ts";
import { ensureFolder, legacyJsonPath, withJsonBlock } from "./vault-json.ts";

/**
 * Every folder the plugin reads from or writes into, parents first. Only the
 * inbox truly has to exist up front — a Shortcut drops a file into it while
 * Obsidian is closed, so nothing on our side can create it in time — but the
 * rest are listed too so the tree a new user sees matches the README.
 */
const WORKSPACE_FOLDERS = [
  VAULT_ROOT,
  INBOX_DIR,
  TRANSACTIONS_DIR,
  ACCOUNTS_DIR,
  SETTINGS_DIR,
  CATEGORIES_DIR,
];

/**
 * A folder with no file in it is not a folder as far as most sync services are
 * concerned: it is dropped on the way to the phone, and the Shortcut then has
 * nowhere to save to. This note keeps the inbox real, and `ingestInbox` skips
 * `readme.md` by name so it is never read as a message.
 */
const INBOX_README = `${INBOX_DIR}/README.md`;

const INBOX_README_BODY = `# Inbox

Drop a bank SMS here as a \`.txt\` or \`.md\` file — one message per file — and it
becomes a transaction note the next time the plugin runs. On iPhone this is the
folder the Shortcut saves to; see the plugin README for the Shortcut itself.

The message is kept verbatim in the note it creates, and the file here is
removed only once that note is on disk. This README is never read as a message.
`;

/**
 * The accounts a new vault starts with: the one everybody has, and one bank
 * account standing in for theirs. `card_endings` is what files a message to an
 * account, so the placeholder carries an obviously fake ending — rename the
 * note and put your own digits in it, or delete it and use **New account** on
 * the Accounts tab.
 */
const DEFAULT_ACCOUNTS: AccountDraft[] = [
  {
    name: "Cash",
    currency: "EGP",
    accountType: "cash",
    institution: "",
    cardEndings: [],
    aliases: [],
    openingBalance: 0,
    openingDate: "",
    referenceBalance: null,
    active: true,
    includeInNetWorth: true,
  },
  {
    name: "Bank1",
    currency: "EGP",
    accountType: "bank",
    institution: "",
    cardEndings: ["1234"],
    aliases: [],
    openingBalance: 0,
    openingDate: "",
    referenceBalance: null,
    active: true,
    includeInNetWorth: true,
  },
];

interface Seed {
  path: string;
  content: string;
}

/**
 * Every file the command owns, with the exact bytes it would write. One list,
 * used both to say what a run would do and to do it, so the warning a user
 * confirms can never describe something other than what follows.
 */
function workspaceSeeds(app: App): Seed[] {
  const seeds: Seed[] = [{ path: INBOX_README, content: INBOX_README_BODY }];

  for (const file of SETTINGS_FILES) {
    const json = JSON.stringify(file.content, null, 2);
    // A legacy `.json` is the live file for a vault that has one, so the reset
    // lands there; writing the note instead would shadow it silently.
    const legacy = normalizePath(legacyJsonPath(file.path));
    if (app.vault.getAbstractFileByPath(legacy)) seeds.push({ path: legacy, content: `${json}\n` });
    else seeds.push({ path: file.path, content: `${file.intro}\n${withJsonBlock("", json)}` });
  }

  for (const account of DEFAULT_ACCOUNTS) {
    seeds.push({ path: accountNotePath(account.name), content: accountNote(account) });
  }

  for (const category of DEFAULT_CATEGORIES) {
    seeds.push({
      path: categoryNotePath(category.name),
      content: categoryNote({
        name: category.name,
        currency: "EGP",
        color: null,
        icon: null,
        monthlyBudget: null,
      }),
    });
  }

  return seeds.map((seed) => ({ ...seed, path: normalizePath(seed.path) }));
}

export interface WorkspacePlan {
  /** Folders that are not there yet. */
  folders: string[];
  /** Files that would be written where there is nothing today. */
  create: string[];
  /** Files that hold something else and would go back to their defaults. */
  reset: string[];
}

/**
 * What `ensureWorkspace` would do, without doing any of it. The `reset` list is
 * what a user stands to lose, so it is what the confirmation shows.
 */
export async function planWorkspace(app: App): Promise<WorkspacePlan> {
  const plan: WorkspacePlan = { folders: [], create: [], reset: [] };

  for (const folder of WORKSPACE_FOLDERS) {
    const path = normalizePath(folder);
    if (!app.vault.getAbstractFileByPath(path)) plan.folders.push(path);
  }

  for (const seed of workspaceSeeds(app)) {
    const existing = app.vault.getAbstractFileByPath(seed.path);
    if (!existing) plan.create.push(seed.path);
    else if (existing instanceof TFile && (await app.vault.cachedRead(existing)) !== seed.content) {
      plan.reset.push(seed.path);
    }
  }

  return plan;
}

export interface WorkspaceResult {
  /** Folders and files this run created, in the order they were made. */
  created: string[];
  /** Files that were already there and have been put back to their defaults. */
  replaced: string[];
  /** Files that were already exactly as this run would have written them. */
  unchanged: string[];
}

/**
 * Writes the whole `Budget/` tree — folders, settings notes, two accounts and
 * the starting categories — so nothing about a fresh install is a file the user
 * has to know to make by hand.
 *
 * **This resets every file it owns.** A settings note, an account note or a
 * category note that is already there is rewritten back to its default, so a
 * colour, a monthly budget, a card ending or a learned keyword on one of those
 * notes is replaced. That is what makes the command a way back to a known
 * state, and why nothing calls it without `planWorkspace` and a confirmation
 * first — see `setUpWorkspace`.
 *
 * What it never touches: transactions, and any account or category note whose
 * name is not one of the defaults.
 */
export async function ensureWorkspace(app: App): Promise<WorkspaceResult> {
  const result: WorkspaceResult = { created: [], replaced: [], unchanged: [] };

  for (const folder of WORKSPACE_FOLDERS) {
    const path = normalizePath(folder);
    if (app.vault.getAbstractFileByPath(path)) {
      result.unchanged.push(path);
      continue;
    }
    await ensureFolder(app, path);
    result.created.push(path);
  }

  for (const seed of workspaceSeeds(app)) {
    await writeSeed(app, result, seed.path, seed.content);
  }

  return result;
}

/**
 * Writes the file, whether or not it was there. A file whose contents already
 * match is left alone rather than rewritten, so a run that changes nothing also
 * touches nothing — no modified time, no sync, no watcher.
 */
async function writeSeed(
  app: App,
  result: WorkspaceResult,
  path: string,
  content: string,
): Promise<void> {
  const normalized = normalizePath(path);
  const existing = app.vault.getAbstractFileByPath(normalized);
  if (existing instanceof TFile) {
    if ((await app.vault.cachedRead(existing)) === content) {
      result.unchanged.push(normalized);
      return;
    }
    await app.vault.process(existing, () => content);
    result.replaced.push(normalized);
    return;
  }
  // A folder sitting on the path is someone else's business; leave it be.
  if (existing) return;
  const slash = normalized.lastIndexOf("/");
  if (slash > 0) await ensureFolder(app, normalized.slice(0, slash));
  await app.vault.create(normalized, content);
  result.created.push(normalized);
}

/** One line for a Notice: what the run made, what it put back, or neither. */
export function describeWorkspace(result: WorkspaceResult): string {
  const reset = result.replaced.length
    ? `reset ${result.replaced.length} file${result.replaced.length === 1 ? "" : "s"} to the defaults`
    : "";
  if (!result.created.length) {
    return reset
      ? `Budget: ${reset}.`
      : `Budget: the ${VAULT_ROOT} files are already in place.`;
  }
  // On a fresh vault the list is the whole tree, which reads worse than naming
  // it; a run that filled a gap or two is short enough to spell out.
  const made = result.unchanged.length && result.created.length <= 4
    ? `created ${result.created.join(", ")}`
    : `created ${VAULT_ROOT} — inbox, transactions, settings, ${DEFAULT_ACCOUNTS.length} accounts and ${DEFAULT_CATEGORIES.length} categories`;
  return `Budget: ${[made, reset].filter(Boolean).join(", and ")}.`;
}
