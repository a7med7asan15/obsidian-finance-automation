import { normalizePath } from "obsidian";
import type { App } from "obsidian";
import { INBOX_DIR } from "../constants.ts";
import { createRawSmsTransaction, decodePercentEscapes } from "./create.ts";
import { isTransactionMessage } from "../domain/parser/relevance.ts";
import type { SmsPatterns } from "../domain/parser/sms.ts";

/** Extensions a Shortcut can realistically save a message as. */
const CAPTURE_EXTENSIONS = new Set(["txt", "md", "text", "log"]);

/**
 * Every folder in this vault carries a README, and `.md` is a capture
 * extension, so the one filename that must never be read as a message is
 * spelled out rather than left to chance.
 */
const NEVER_A_MESSAGE = new Set(["readme.md"]);

function basenameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1).toLowerCase();
}

export interface InboxResult {
  /** Paths of the transaction notes created, oldest capture first. */
  created: string[];
  /** Spool files left in place because they held no message. */
  empty: string[];
  /** Spool files deleted unread: the message was not about money moving. */
  ignored: string[];
  failed: Array<{ path: string; error: string }>;
}

function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  return dot > slash ? path.slice(dot + 1).toLowerCase() : "";
}

/**
 * Turns every message file in `Budget/Inbox` into a transaction note.
 *
 * The whole thing reads through the vault adapter rather than the file index:
 * a Shortcut writes into the vault folder while Obsidian is closed, so the file
 * is on disk before metadataCache has ever heard of it. The adapter sees it
 * either way, and on a phone that is the difference between a capture landing
 * and a capture waiting for a restart.
 *
 * A spool file is removed only once its note is on disk, and the message
 * survives verbatim in `sms_message` and the Original SMS block. A file that
 * fails is left where it is, so a capture is never consumed without a note to
 * show for it.
 *
 * A capture that says nothing about money moving — a statement reminder, a due
 * date, a one-time code, an offer — never becomes a note. A bank thread is
 * mostly those, and they carry amounts and card numbers, so left alone they
 * arrive as transactions that never happened. Its spool file is deleted rather
 * than left behind, because a Shortcut that forwards the whole thread would
 * otherwise silt the inbox up with the same messages every run.
 */
export async function ingestInbox(app: App, patterns: SmsPatterns = {}): Promise<InboxResult> {
  const result: InboxResult = { created: [], empty: [], ignored: [], failed: [] };
  const directory = normalizePath(INBOX_DIR);
  const adapter = app.vault.adapter;
  if (!(await adapter.exists(directory))) return result;

  const listed = await adapter.list(directory);
  // Oldest first: a Shortcut names its drops by timestamp, so the path order is
  // the order the messages arrived, and notes read back in the same order.
  for (const path of [...listed.files].sort()) {
    if (!CAPTURE_EXTENSIONS.has(extensionOf(path))) continue;
    if (NEVER_A_MESSAGE.has(basenameOf(path))) continue;
    try {
      // Decoded first: a Shortcut can spool a message still in its percent
      // spelling, and `تم خصم` reads as `%D8%AA...` until it is decoded, which
      // no keyword would ever match.
      const message = decodePercentEscapes((await adapter.read(path)).trim());
      if (!message) {
        result.empty.push(path);
        continue;
      }
      if (!isTransactionMessage(message, patterns)) {
        await adapter.remove(path);
        result.ignored.push(path);
        continue;
      }
      const file = await createRawSmsTransaction(app, { message }, patterns);
      await adapter.remove(path);
      result.created.push(file.path);
    } catch (error) {
      result.failed.push({ path, error: (error as Error).message });
    }
  }
  return result;
}

/** One line for a Notice, or null when the inbox held nothing to say. */
export function describeInbox(result: InboxResult): string | null {
  const parts: string[] = [];
  if (result.created.length) parts.push(`captured ${result.created.length} message(s) from the inbox`);
  if (result.ignored.length) parts.push(`discarded ${result.ignored.length} non-transaction message(s)`);
  if (result.failed.length) parts.push(`${result.failed.length} failed`);
  if (result.empty.length) parts.push(`${result.empty.length} empty file(s) left in place`);
  return parts.length ? parts.join(", ") : null;
}
