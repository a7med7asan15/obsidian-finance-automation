import { readBoolean, readNumber, readString, readStringList } from "./frontmatter.ts";
import { isPlaceholderAccount } from "../domain/parser/sms.ts";
import { toDateParts } from "../domain/dates.ts";
import { readCounterparty } from "../domain/counterparty.ts";
import { TRANSACTIONS_DIR } from "../constants.ts";
import type {
  AccountRecord, CategoryRecord, ExcludeSource, TransactionRecord, TransactionStatus, TransactionType,
  TypeSource,
} from "./types.ts";

const TYPES: TransactionType[] = ["debit", "credit", "transfer", "fee"];
const STATUSES: TransactionStatus[] = ["pending", "parsed"];

function readType(value: unknown): TransactionType {
  const raw = readString(value).toLowerCase() as TransactionType;
  return TYPES.includes(raw) ? raw : "";
}

function basename(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/, "") ?? path;
}

export function isTransactionPath(path: string): boolean {
  return (
    path.startsWith(`${TRANSACTIONS_DIR}/`) &&
    path.endsWith(".md") &&
    path !== `${TRANSACTIONS_DIR}/README.md`
  );
}

export function buildTransaction(
  frontmatter: Record<string, unknown>,
  path: string,
): TransactionRecord {
  const timestamp = readString(frontmatter.timestamp);
  const parts = toDateParts(timestamp);

  const type = readType(frontmatter.transaction_type);
  const rawTypeSource = readString(frontmatter.type_source).toLowerCase();
  const typeSource: TypeSource =
    rawTypeSource === "rule" || rawTypeSource === "manual" ? rawTypeSource : null;

  const rawStatus = readString(frontmatter.status).toLowerCase() as TransactionStatus;
  const status: TransactionStatus = STATUSES.includes(rawStatus) ? rawStatus : "pending";

  const excluded = readBoolean(frontmatter.excluded, false);
  const rawSource = readString(frontmatter.exclude_source).toLowerCase();
  const excludeSource: ExcludeSource = !excluded
    ? null
    : rawSource === "rule"
      ? "rule"
      : "manual";

  const { counterparty, counterpartyRole } = readCounterparty({
    merchant: readString(frontmatter.merchant),
    recipient: readString(frontmatter.recipient),
    sender: readString(frontmatter.sender),
  });
  const smsMessage = readString(frontmatter.sms_message);
  const category = readString(frontmatter.category) || "Uncategorized";
  const fromAccount = readString(frontmatter.from_account);
  const toAccount = readString(frontmatter.to_account);

  return {
    path,
    timestamp,
    date: parts?.date ?? null,
    month: parts?.month ?? null,
    year: parts?.year ?? null,
    time: parts?.time ?? null,
    epoch: parts?.epoch ?? null,
    amount: readNumber(frontmatter.amount),
    currency: readString(frontmatter.currency),
    fromAccount,
    toAccount,
    category,
    counterparty,
    counterpartyRole,
    type,
    status,
    source: readString(frontmatter.source),
    smsMessage,
    parserConfidence: readNumber(frontmatter.parser_confidence),
    transactionId: readString(frontmatter.transaction_id),
    excluded,
    excludeReason: readString(frontmatter.exclude_reason),
    excludeSource,
    excludeRuleId: readString(frontmatter.exclude_rule_id),
    typeSource,
    typeRuleId: typeSource === "rule" ? readString(frontmatter.type_rule_id) : "",
    typeBeforeRule: typeSource === "rule" ? readType(frontmatter.type_before_rule) : "",
    // Whitespace is collapsed because a bank pads its messages with runs of
    // spaces, and a search typed with single ones would otherwise miss them.
    searchBlob: [counterparty, smsMessage, category, fromAccount, toAccount]
      .filter(Boolean).join(" ").replace(/\s+/gu, " ").toLowerCase(),
  };
}

export function buildAccount(
  frontmatter: Record<string, unknown>,
  path: string,
): AccountRecord {
  const cardEndings = readStringList(frontmatter.card_endings);
  const singleEnding = readString(frontmatter.card_ending);
  if (singleEnding && !cardEndings.includes(singleEnding)) cardEndings.push(singleEnding);

  return {
    path,
    name: readString(frontmatter.name) || basename(path),
    currency: readString(frontmatter.currency) || "EGP",
    accountType: readString(frontmatter.account_type) || "bank",
    cardEndings,
    aliases: readStringList(frontmatter.aliases),
    openingBalance: readNumber(frontmatter.opening_balance) ?? 0,
    openingDate: readString(frontmatter.opening_date) || null,
    referenceBalance: readNumber(frontmatter.balance),
    referenceUpdatedAt: readString(frontmatter.balance_updated_at) || null,
    active: readBoolean(frontmatter.active, true),
    includeInNetWorth: readBoolean(frontmatter.include_in_net_worth, true),
    institution: readString(frontmatter.institution),
  };
}

export function buildCategory(
  frontmatter: Record<string, unknown>,
  path: string,
): CategoryRecord {
  return {
    path,
    name: readString(frontmatter.name) || basename(path),
    currency: readString(frontmatter.currency) || "EGP",
    color: readString(frontmatter.color) || null,
    icon: readString(frontmatter.icon) || null,
    monthlyBudget: readNumber(frontmatter.monthly_budget),
  };
}

const RECORD_KEYS: Record<string, keyof TransactionRecord> = {
  amount: "amount",
  currency: "currency",
  from_account: "fromAccount",
  to_account: "toAccount",
  category: "category",
  // The three party keys are one field: a name already under any of them means
  // the note names its party, so the parser leaves all three alone.
  merchant: "counterparty",
  recipient: "counterparty",
  sender: "counterparty",
  transaction_type: "type",
  status: "status",
  parser_confidence: "parserConfidence",
  transaction_id: "transactionId",
};

/** Maps a frontmatter key to its record field, or null when there is no match. */
export function toRecordKey(frontmatterKey: string): keyof TransactionRecord | null {
  return RECORD_KEYS[frontmatterKey] ?? null;
}

/** Keys the parser owns outright, overwriting whatever a note already has. */
const PARSER_OWNED = new Set(["status", "parser_confidence", "transaction_id"]);

/** An absent key, an empty string and a null all mean the same thing in frontmatter. */
function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * The parser fills only empty fields; anything set by hand wins, and the three
 * parser-owned keys are rewritten from the message every time.
 *
 * A value equal to the one the note already holds is not a change. That matters
 * because a note only stops being reparsed once it reaches `parsed`: a `pending`
 * note is parsed again on every pass, and writing its frontmatter fires the same
 * `modify` event the watcher uses to schedule the next pass. With identical
 * values still counted as changes, such a note rewrote itself for as long as the
 * vault stayed open.
 */
export function parserChanges(
  record: TransactionRecord,
  // Any parse result: the keys that are not frontmatter keys are dropped below.
  parsed: object,
): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const recordKey = toRecordKey(key);
    if (!recordKey) continue;
    const current = record[recordKey] as unknown;
    // A stand-in card name and "Uncategorized" are both what the parser writes
    // when it knows nothing; neither is an answer worth keeping, so a later
    // pass that does know better replaces them.
    const isDefault =
      (key === "category" && current === "Uncategorized") ||
      ((key === "from_account" || key === "to_account") && isPlaceholderAccount(current));
    if (!PARSER_OWNED.has(key) && !isDefault && !isEmpty(current)) continue;
    // A default is replaced by an answer, never by the absence of one.
    if (isDefault && isEmpty(value)) continue;
    if (current === value || (isEmpty(current) && isEmpty(value))) continue;
    changes[key] = value;
  }
  return changes;
}

/**
 * The record as it will read once `changes` are written, so a later step in the
 * same pass — a type rule after the parser, an exclusion rule after a type rule
 * — sees what the note is about to say rather than what it said before.
 */
export function withChanges(
  record: TransactionRecord,
  changes: Record<string, unknown>,
): TransactionRecord {
  const next = { ...record };
  const party = ["merchant", "recipient", "sender"] as const;
  for (const role of party) {
    const value = changes[role];
    if (typeof value === "string" && value) {
      next.counterparty = value;
      next.counterpartyRole = role;
    }
  }
  for (const [key, value] of Object.entries(changes)) {
    if ((party as readonly string[]).includes(key)) continue;
    if (key === "type_source") next.typeSource = (value || null) as TypeSource;
    else if (key === "type_rule_id") next.typeRuleId = readString(value);
    else if (key === "type_before_rule") next.typeBeforeRule = readType(value);
    else if (key === "transaction_type") next.type = readType(value);
    else {
      const recordKey = toRecordKey(key);
      if (recordKey) (next as Record<string, unknown>)[recordKey] = value ?? "";
    }
  }
  return next;
}
