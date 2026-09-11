import { readBoolean, readNumber, readString, readStringList } from "./frontmatter.ts";
import { toDateParts } from "../domain/dates.ts";
import { TRANSACTIONS_DIR } from "../constants.ts";
import type {
  AccountRecord, CategoryRecord, ExcludeSource, TransactionRecord, TransactionStatus, TransactionType,
} from "./types.ts";

const TYPES: TransactionType[] = ["debit", "credit", "transfer", "fee"];
const STATUSES: TransactionStatus[] = ["pending", "parsed", "needs_review"];

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

  const rawType = readString(frontmatter.transaction_type).toLowerCase() as TransactionType;
  const type: TransactionType = TYPES.includes(rawType) ? rawType : "";

  const rawStatus = readString(frontmatter.status).toLowerCase() as TransactionStatus;
  const status: TransactionStatus = STATUSES.includes(rawStatus) ? rawStatus : "pending";

  const excluded = readBoolean(frontmatter.excluded, false);
  const rawSource = readString(frontmatter.exclude_source).toLowerCase();
  const excludeSource: ExcludeSource = !excluded
    ? null
    : rawSource === "rule"
      ? "rule"
      : "manual";

  const merchant = readString(frontmatter.merchant);
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
    merchant,
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
    searchBlob: [merchant, smsMessage, category, fromAccount, toAccount]
      .filter(Boolean).join(" ").toLowerCase(),
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
  merchant: "merchant",
  transaction_type: "type",
  status: "status",
  parser_confidence: "parserConfidence",
  transaction_id: "transactionId",
};

/** Maps a frontmatter key to its record field, or null when there is no match. */
export function toRecordKey(frontmatterKey: string): keyof TransactionRecord | null {
  return RECORD_KEYS[frontmatterKey] ?? null;
}
