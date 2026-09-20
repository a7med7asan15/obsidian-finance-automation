import { extractByPatterns, hasKeyword } from "./patterns.ts";
import { categorize, type CategoryRules } from "../categorize.ts";
import { cleanCounterpartyName, counterpartyFields, roleForType } from "../counterparty.ts";
import type { AccountRecord, TransactionType } from "../../data/types.ts";
import { asText } from "../../data/frontmatter.ts";

export type { CategoryRules };

export interface SmsPatterns {
  /**
   * What a message must say before it is read as a transaction at all. A
   * capture that matches none of these is dropped rather than parsed; see
   * `isTransactionMessage`.
   */
  transaction_keywords?: string[];
  credit_keywords?: string[];
  debit_keywords?: string[];
  transfer_keywords?: string[];
  fee_keywords?: string[];
  amount_patterns?: string[];
  card_ending_patterns?: string[];
  merchant_patterns?: string[];
  /** Who money was sent to, used for a transfer. */
  recipient_patterns?: string[];
  /** Who money came from, used for a credit. */
  sender_patterns?: string[];
  /** Optional. Named groups: year, month, day, and optionally hour, minute, second. */
  date_patterns?: string[];
}

export interface AccountConfig {
  accounts: Array<{ name: string; currency?: string; card_endings?: string[]; aliases?: string[] }>;
}

export interface ParsedSms {
  amount: number | null;
  currency: string;
  from_account: string;
  to_account: string;
  category: string;
  /** Exactly one of the three carries the party; see counterpartyFields. */
  merchant: string;
  recipient: string;
  sender: string;
  transaction_type: TransactionType;
  status: "parsed" | "pending";
  parser_confidence: number;
  transaction_id: string;
}

export function normalizeCurrency(value: string, fallback: string): string {
  if (!value) return fallback || "";
  const clean = String(value).toUpperCase().replaceAll(" ", "").replaceAll(".", "");
  return clean === "جم" || clean === "جـم" ? "EGP" : clean;
}

/** 64-bit FNV-ish hash, rendered as 16 hex characters. Stable across platforms. */
export function stableId(text: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return first.toString(16).padStart(8, "0") + second.toString(16).padStart(8, "0");
}

/**
 * Pulls a party name out of the message. The capture is either a named group
 * `name` or the first group, so a pattern written either way works.
 */
function extractParty(sms: string, patterns: string[] | undefined): string {
  const match = extractByPatterns(sms, patterns);
  if (!match) return "";
  return cleanCounterpartyName(match.groups?.name ?? match[1] ?? "");
}

const uniqueStrings = (values: string[]): string[] => {
  const found: string[] = [];
  for (const value of values) {
    const clean = String(value ?? "").trim();
    if (clean && !found.includes(clean)) found.push(clean);
  }
  return found;
};

/**
 * Merges the account notes in `Budget/Accounts/` over `Budget/Settings/accounts.md`
 * so the notes are the single place card endings and aliases are maintained. The JSON
 * file still works for an account that has no note yet. Entries are matched by name,
 * case-insensitively, and their endings and aliases are unioned rather than replaced —
 * an ending listed in either source resolves to the same account. Notes are listed
 * first, which is what a transfer uses to pick the from-account.
 */
export function mergeAccountSources(notes: AccountRecord[], config: AccountConfig): AccountConfig {
  const accounts: AccountConfig["accounts"] = [];
  const positionOf = new Map<string, number>();

  const add = (name: string, currency: string, endings: string[], aliases: string[]): void => {
    const clean = String(name ?? "").trim();
    if (!clean) return;
    const key = clean.toLocaleLowerCase();
    const at = positionOf.get(key);
    if (at === undefined) {
      positionOf.set(key, accounts.length);
      accounts.push({
        name: clean,
        currency: currency || undefined,
        card_endings: uniqueStrings(endings),
        aliases: uniqueStrings(aliases),
      });
      return;
    }
    const entry = accounts[at];
    if (!entry.currency && currency) entry.currency = currency;
    entry.card_endings = uniqueStrings([...(entry.card_endings ?? []), ...endings]);
    entry.aliases = uniqueStrings([...(entry.aliases ?? []), ...aliases]);
  };

  for (const note of notes) add(note.name, note.currency, note.cardEndings, note.aliases);
  for (const entry of config.accounts ?? []) {
    add(
      String(entry.name ?? ""),
      String(entry.currency ?? ""),
      (entry.card_endings ?? []).map(String),
      (entry.aliases ?? []).map(String),
    );
  }

  return { accounts };
}

/**
 * The stand-in an ending no account claims is filed under, so a transaction
 * still names the card it came from. It is provisional: a later pass replaces
 * it the moment an account note lists the ending.
 */
export function placeholderAccount(ending: string): string {
  return `Card ••••${ending}`;
}

/** Whether an account name is one of those stand-ins rather than a real account. */
export function isPlaceholderAccount(value: unknown): boolean {
  return /^Card ••••[0-9]+$/u.test(asText(value).trim());
}

export function accountCandidates(sms: string, ending: string, accounts: AccountConfig): string[] {
  const folded = sms.toLocaleLowerCase();
  const found: string[] = [];
  for (const account of accounts.accounts ?? []) {
    const name = String(account.name ?? "").trim();
    const endings = (account.card_endings ?? []).map(String);
    const aliases = [name, ...(account.aliases ?? [])];
    const matchesAlias = aliases.some((alias) => {
      const clean = String(alias).trim().toLocaleLowerCase();
      return clean.length >= 3 && folded.includes(clean);
    });
    if (name && ((ending && endings.includes(ending)) || matchesAlias) && !found.includes(name)) {
      found.push(name);
    }
  }
  if (!found.length && ending) found.push(placeholderAccount(ending));
  return found;
}

export function parseSms(
  sms: string,
  timestamp: string,
  config: { default_currency?: string },
  patterns: SmsPatterns,
  accounts: AccountConfig,
  categories: CategoryRules,
): ParsedSms {
  const amountMatch = extractByPatterns(sms, patterns.amount_patterns);
  const amountText = amountMatch?.groups?.amount?.replaceAll(",", "");
  const amount = amountText && Number.isFinite(Number(amountText)) ? Number(amountText) : null;
  const currencyText = amountMatch?.groups?.currency1 || amountMatch?.groups?.currency2 || "";
  const currency = normalizeCurrency(
    currencyText,
    amount !== null ? (config.default_currency ?? "EGP") : "",
  );

  const endingMatch = extractByPatterns(sms, patterns.card_ending_patterns);
  const ending = endingMatch?.groups?.ending ?? "";
  const candidates = accountCandidates(sms, ending, accounts);
  const isTransfer = hasKeyword(sms, patterns.transfer_keywords);
  const isFee = hasKeyword(sms, patterns.fee_keywords);
  const isCredit = hasKeyword(sms, patterns.credit_keywords);
  const isDebit = hasKeyword(sms, patterns.debit_keywords);

  let transactionType: TransactionType = "";
  if (isTransfer) transactionType = "transfer";
  else if (isFee && !isCredit) transactionType = "fee";
  else if (isCredit && !isDebit) transactionType = "credit";
  else if (isDebit && !isCredit) transactionType = "debit";

  // The name the message carries is the same thing whichever direction the
  // money went; only what to call it changes, and the type decides that. Each
  // role falls back to the merchant patterns, because a bank writes a refund
  // and a card purchase the same way.
  const role = roleForType(transactionType);
  const merchantName = extractParty(sms, patterns.merchant_patterns);
  const counterparty =
    role === "sender"
      ? extractParty(sms, patterns.sender_patterns) || merchantName
      : role === "recipient"
        ? extractParty(sms, patterns.recipient_patterns) || merchantName
        : merchantName || extractParty(sms, patterns.recipient_patterns);

  let fromAccount = "";
  let toAccount = "";
  if (transactionType === "debit" || transactionType === "fee") fromAccount = candidates[0] ?? "";
  else if (transactionType === "credit") toAccount = candidates[0] ?? "";
  else if (transactionType === "transfer") {
    // A transfer names one account of yours far more often than two, and which
    // side it belongs on is the whole difference between money in and money
    // out. The bank says so in the same breath — "إلى حسابك" against "من
    // حسابك", "to your account" against "from your account" — so the credit
    // and debit keywords place it, and only a message that says neither falls
    // back to the order the accounts were found in.
    const incoming = isCredit && !isDebit;
    fromAccount = incoming ? (candidates[1] ?? "") : (candidates[0] ?? "");
    toAccount = incoming ? (candidates[0] ?? "") : (candidates[1] ?? "");
  }

  let category = categorize(`${sms}\n${counterparty}`, categories);
  if (transactionType === "fee") category = "Fees";
  else if (transactionType === "transfer" && category === "Uncategorized") category = "Transfer";

  // A stand-in card name is not an account the vault knows, so it does not
  // count towards confidence: a note filed under one is still waiting for the
  // ending to be listed on an account note.
  const resolved = candidates.some((candidate) => !isPlaceholderAccount(candidate));
  const checks = [amount !== null, Boolean(currency), Boolean(transactionType), resolved];
  if (category !== "Uncategorized") checks.push(true);
  const confidence =
    Math.round((checks.filter(Boolean).length / checks.length) * 100) / 100;
  const complete = amount !== null && Boolean(currency) && Boolean(transactionType) && Boolean(fromAccount || toAccount);
  const fingerprint = `${sms.trim().toLocaleLowerCase().replace(/\s+/g, " ")}|${timestamp}`;

  return {
    amount,
    currency,
    from_account: fromAccount,
    to_account: toAccount,
    category,
    ...counterpartyFields(counterparty, role),
    transaction_type: transactionType,
    status: complete ? "parsed" : "pending",
    parser_confidence: confidence,
    transaction_id: stableId(fingerprint),
  };
}

/**
 * Finds the date the bank wrote in the message body, so a capture that arrives
 * late is filed under the day it happened rather than the day it was pasted.
 * Patterns come from the same user-editable file and use the same translation,
 * with named groups `year`, `month`, `day` and optional `hour`, `minute`, `second`.
 */
/**
 * A two-digit year as the century we are in. A bank writes `19/09/26` as often
 * as it writes `19/09/2026`, and padding the short one with zeroes instead
 * would file the transaction in the year 26 — a date `Date.parse` accepts
 * happily, so nothing downstream would notice. Nothing wider is needed: these
 * are messages about money that has just moved.
 */
function expandYear(year: string): string {
  return year.length === 2 ? String(2000 + Number(year)) : year;
}

export function extractTimestamp(sms: string, patterns: SmsPatterns): string | null {
  const match = extractByPatterns(sms, patterns.date_patterns);
  const groups = match?.groups;
  if (!groups) return null;

  const year = expandYear(groups.year ?? "");
  const month = groups.month ?? "";
  const day = groups.day ?? "";
  if (!year || !month || !day) return null;

  const pad = (value: string, width = 2) => String(value).padStart(width, "0");
  const date = `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
  const time = `${pad(groups.hour ?? "00")}:${pad(groups.minute ?? "00")}:${pad(groups.second ?? "00")}`;
  const candidate = `${date}T${time}+03:00`;
  return Number.isFinite(Date.parse(candidate)) ? candidate : null;
}
