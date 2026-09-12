import { TFile, normalizePath } from "obsidian";
import type { App } from "obsidian";
import { TRANSACTIONS_DIR } from "../constants.ts";
import { ensureFolder } from "./vault-json.ts";
import { extractTimestamp, normalizeCurrency, stableId } from "../domain/parser/sms.ts";
import { roleForType } from "../domain/counterparty.ts";
import type { SmsPatterns } from "../domain/parser/sms.ts";
import type { TransactionType } from "./types.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The parameters Obsidian hands a protocol handler. */
export type ProtocolParams = Record<string, string>;

/** Keys the capture links define; everything else is message text split on `&`. */
const KNOWN_PARAMS = new Set(["action", "message", "sms", "text", "timestamp", "date"]);

function yamlString(value: unknown): string {
  return JSON.stringify(String(value ?? ""));
}

export function protocolValue(params: ProtocolParams, ...names: string[]): string {
  for (const name of names) {
    const value = params?.[name];
    if (value !== null && value !== undefined && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

/**
 * Obsidian splits the query string on `&`, so an SMS that reaches the handler
 * unencoded with a literal `&` in it arrives truncated, its tail spread across
 * stray parameter keys. Gluing the extras back on in the order received keeps
 * such a message whole; the Shortcut should still encode it.
 */
export function protocolMessage(params: ProtocolParams): string {
  let message = protocolValue(params, "message", "sms", "text");
  if (!message) return "";
  for (const [key, value] of Object.entries(params ?? {})) {
    if (KNOWN_PARAMS.has(key)) continue;
    message += `&${key}`;
    if (value !== null && value !== undefined && String(value) !== "") message += `=${value}`;
  }
  return decodePercentEscapes(message);
}

const PERCENT_RUN = /(?:%[0-9A-Fa-f]{2})+/g;
const HAS_ESCAPE = /%[0-9A-Fa-f]{2}/;

/**
 * Obsidian normally hands the handler a decoded value, but it gives up and
 * passes the raw text through when the link was encoded twice, or when a
 * truncated link leaves a half-written escape it cannot decode. A message that
 * still carries `%20` in place of every space is one of those, so it is decoded
 * here rather than stored as the machine spelling of itself.
 *
 * The absence of whitespace is what marks it: a decoded bank message has
 * spaces, and only an encoded one has none. Each run of escapes is decoded on
 * its own, and a run ending in an incomplete UTF-8 sequence keeps its tail
 * rather than losing the whole run.
 */
export function decodePercentEscapes(text: string, passes = 2): string {
  let current = text;
  for (let pass = 0; pass < passes; pass += 1) {
    if (/\s/.test(current) || !HAS_ESCAPE.test(current)) break;
    current = current.replace(PERCENT_RUN, decodeRun);
  }
  return current;
}

function decodeRun(run: string): string {
  for (let end = run.length; end >= 3; end -= 3) {
    try {
      return decodeURIComponent(run.slice(0, end)) + run.slice(end);
    } catch {
      // The tail is half of a multi-byte character; drop one escape and retry.
    }
  }
  return run;
}

export function transactionPathParts(timestamp: string): string {
  const direct = String(timestamp).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (direct) {
    return `${direct[1]}/${MONTHS[Number(direct[2]) - 1]}/${direct[3]}T${direct[4]}-${direct[5]}-${direct[6]}`;
  }
  const date = new Date(timestamp);
  const usable = Number.isNaN(date.getTime()) ? new Date() : date;
  const two = (value: number) => String(value).padStart(2, "0");
  return [
    usable.getFullYear(),
    MONTHS[usable.getMonth()],
    `${two(usable.getDate())}T${two(usable.getHours())}-${two(usable.getMinutes())}-${two(usable.getSeconds())}`,
  ].join("/");
}

export function uniqueTransactionPath(app: App, timestamp: string): string {
  const base = `${TRANSACTIONS_DIR}/${transactionPathParts(timestamp)}`;
  let candidate = `${base}.md`;
  let suffix = 2;
  while (app.vault.getAbstractFileByPath(candidate)) {
    candidate = `${base}-${suffix}.md`;
    suffix += 1;
  }
  return candidate;
}

export interface TransactionFields {
  timestamp: string;
  amount: number | null;
  currency: string;
  from_account: string;
  to_account: string;
  category: string;
  /** The merchant, recipient or sender; the type decides which key holds it. */
  counterparty: string;
  /** Kept as a raw string so an unrecognised type from a capture link survives verbatim. */
  transaction_type: string;
  status: string;
  source: string;
  parser_confidence: number | null;
  transaction_id: string;
}

export function transactionMarkdown(fields: TransactionFields, sms: string, note = ""): string {
  // One party key, named for the role the type implies, so a note never claims
  // a salary came from a merchant.
  const partyKey = roleForType(fields.transaction_type);
  const lines = [
    "---",
    "type: transaction",
    `timestamp: ${yamlString(fields.timestamp)}`,
    `sms_message: ${yamlString(sms)}`,
    fields.amount === null || fields.amount === undefined ? "amount:" : `amount: ${fields.amount}`,
    fields.currency ? `currency: ${yamlString(fields.currency)}` : "currency:",
    fields.from_account ? `from_account: ${yamlString(fields.from_account)}` : "from_account:",
    fields.to_account ? `to_account: ${yamlString(fields.to_account)}` : "to_account:",
    `category: ${yamlString(fields.category || "Uncategorized")}`,
    fields.counterparty ? `${partyKey}: ${yamlString(fields.counterparty)}` : `${partyKey}:`,
    fields.transaction_type ? `transaction_type: ${yamlString(fields.transaction_type)}` : "transaction_type:",
    `status: ${fields.status || "pending"}`,
    `source: ${fields.source}`,
    fields.parser_confidence === null || fields.parser_confidence === undefined
      ? "parser_confidence:"
      : `parser_confidence: ${fields.parser_confidence}`,
    fields.transaction_id ? `transaction_id: ${yamlString(fields.transaction_id)}` : "transaction_id:",
    "tags:",
    "  - finance/transaction",
    "---",
    "",
    "# Transaction",
    "",
    "## Original SMS",
    "",
    "```text",
    sms,
    "```",
    "",
  ];
  if (note) lines.push("## Notes", "", note, "");
  return lines.join("\n");
}

export async function writeVaultFile(app: App, vaultPath: string, content: string): Promise<void> {
  const normalized = normalizePath(vaultPath);
  const slash = normalized.lastIndexOf("/");
  if (slash > 0) await ensureFolder(app, normalized.slice(0, slash));
  const existing = app.vault.getAbstractFileByPath(normalized);
  if (existing instanceof TFile) await app.vault.process(existing, () => content);
  else if (existing) throw new Error(`${normalized} exists but is not a file.`);
  else await app.vault.create(normalized, content);
}

async function createFile(app: App, path: string, content: string): Promise<TFile> {
  await writeVaultFile(app, path, content);
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) throw new Error(`Could not create ${path}.`);
  return file;
}

/**
 * The SMS link carries only the message, so the date the bank wrote beats the
 * moment the capture happened — an SMS pasted the morning after still files
 * under the night it arrived.
 */
export function resolveCaptureTimestamp(
  params: ProtocolParams,
  sms: string,
  patterns: SmsPatterns,
  now: Date = new Date(),
): string {
  return (
    protocolValue(params, "timestamp", "date") ||
    extractTimestamp(sms, patterns) ||
    now.toISOString()
  );
}

export async function createRawSmsTransaction(
  app: App,
  params: ProtocolParams,
  patterns: SmsPatterns = {},
): Promise<TFile> {
  const sms = protocolMessage(params);
  if (!sms) throw new Error("the message parameter is empty");
  const timestamp = resolveCaptureTimestamp(params, sms, patterns);
  const path = uniqueTransactionPath(app, timestamp);
  const content = transactionMarkdown({
    timestamp,
    amount: null,
    currency: "",
    from_account: "",
    to_account: "",
    category: "Uncategorized",
    counterparty: "",
    transaction_type: "",
    status: "pending",
    source: "iphone-shortcut-sms",
    parser_confidence: null,
    transaction_id: "",
  }, sms);
  return createFile(app, path, content);
}

export async function createStructuredTransaction(app: App, params: ProtocolParams): Promise<TFile> {
  const amountText = protocolValue(params, "amount").replaceAll(",", "");
  const amount = amountText && Number.isFinite(Number(amountText)) ? Number(amountText) : null;
  const currency = normalizeCurrency(protocolValue(params, "currency"), "");
  const transactionType = protocolValue(params, "type", "transaction_type").toLocaleLowerCase();
  const validType = ["debit", "credit", "transfer", "fee"].includes(transactionType);
  const account = protocolValue(params, "account", "account_name");
  let fromAccount = protocolValue(params, "from", "from_account");
  let toAccount = protocolValue(params, "to", "to_account");
  if (account && !fromAccount && !toAccount) {
    if (transactionType === "credit") toAccount = account;
    else fromAccount = account;
  }
  const timestamp = protocolValue(params, "timestamp", "date") || new Date().toISOString();
  const sms = protocolValue(params, "message", "sms", "text");
  const category = protocolValue(params, "category") || "Uncategorized";
  const counterparty = protocolValue(params, "merchant", "recipient", "sender", "counterparty");
  const checks = [amount !== null, Boolean(currency), validType, Boolean(fromAccount || toAccount)];
  const complete = checks.every(Boolean);
  const fingerprint = [timestamp, amount, currency, transactionType, fromAccount, toAccount, counterparty].join("|");
  const path = uniqueTransactionPath(app, timestamp);
  const content = transactionMarkdown({
    timestamp,
    amount,
    currency,
    from_account: fromAccount,
    to_account: toAccount,
    category,
    counterparty,
    transaction_type: transactionType,
    status: complete ? "parsed" : "needs_review",
    source: "iphone-shortcut-fields",
    parser_confidence: checks.filter(Boolean).length / checks.length,
    transaction_id: stableId(fingerprint),
  }, sms);
  return createFile(app, path, content);
}

export interface ManualTransactionFields {
  timestamp: string;
  amount: number;
  currency: string;
  fromAccount: string;
  toAccount: string;
  category: string;
  counterparty: string;
  type: TransactionType;
  note: string;
}

export async function createManualTransaction(
  app: App,
  fields: ManualTransactionFields,
): Promise<TFile> {
  const path = uniqueTransactionPath(app, fields.timestamp);
  const content = transactionMarkdown({
    timestamp: fields.timestamp,
    amount: fields.amount,
    currency: fields.currency,
    from_account: fields.fromAccount,
    to_account: fields.toAccount,
    category: fields.category || "Uncategorized",
    counterparty: fields.counterparty,
    transaction_type: fields.type,
    status: "parsed",
    source: "manual-ui",
    parser_confidence: 1,
    transaction_id: stableId(
      [fields.timestamp, fields.amount, fields.currency, fields.type,
       fields.fromAccount, fields.toAccount, fields.counterparty].join("|"),
    ),
  }, "", fields.note);
  return createFile(app, path, content);
}
