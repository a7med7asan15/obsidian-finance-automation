export type TransactionType = "debit" | "credit" | "transfer" | "fee" | "";
/**
 * Who the money met. The three names are also the frontmatter keys a
 * transaction note stores the party under, so a role is never written down
 * separately: `merchant` for a purchase, `recipient` for money sent, `sender`
 * for money received. An empty role means the note names no party at all.
 */
export type CounterpartyRole = "merchant" | "recipient" | "sender" | "";
export type TransactionStatus = "pending" | "parsed" | "needs_review";
export type ExcludeSource = "manual" | "rule" | null;

export interface TransactionRecord {
  path: string;
  timestamp: string;
  /** "YYYY-MM-DD" in Africa/Cairo, or null when the timestamp is unreadable. */
  date: string | null;
  /** "YYYY-MM" */
  month: string | null;
  /** "YYYY" */
  year: string | null;
  /** "HH:mm" */
  time: string | null;
  epoch: number | null;
  amount: number | null;
  currency: string;
  fromAccount: string;
  toAccount: string;
  category: string;
  /** The merchant, recipient or sender — whichever of the three the note names. */
  counterparty: string;
  counterpartyRole: CounterpartyRole;
  type: TransactionType;
  status: TransactionStatus;
  source: string;
  smsMessage: string;
  parserConfidence: number | null;
  transactionId: string;
  excluded: boolean;
  excludeReason: string;
  excludeSource: ExcludeSource;
  excludeRuleId: string;
  /** Lower-cased counterparty + sms + category + accounts, for substring search. */
  searchBlob: string;
}

export interface AccountRecord {
  path: string;
  name: string;
  currency: string;
  accountType: string;
  cardEndings: string[];
  aliases: string[];
  openingBalance: number;
  /** "YYYY-MM-DD"; null means count every transaction. */
  openingDate: string | null;
  /** The legacy `balance` field, kept as a statement reference figure. */
  referenceBalance: number | null;
  referenceUpdatedAt: string | null;
  active: boolean;
  includeInNetWorth: boolean;
  institution: string;
}

export interface CategoryRecord {
  path: string;
  name: string;
  currency: string;
  color: string | null;
  icon: string | null;
  monthlyBudget: number | null;
}

export type PeriodUnit = "month" | "year" | "all" | "custom";

export interface Period {
  unit: PeriodUnit;
  /** "YYYY-MM" when unit is "month", "YYYY" when "year". Ignored otherwise. */
  anchor: string;
  /** "YYYY-MM-DD", only used when unit is "custom". */
  from: string | null;
  to: string | null;
}

export type ExcludedMode = "hide" | "show" | "only";

export interface Filter {
  period: Period;
  categories: string[];
  accounts: string[];
  types: TransactionType[];
  statuses: TransactionStatus[];
  search: string;
  amountMin: number | null;
  amountMax: number | null;
  excluded: ExcludedMode;
}

export const DEFAULT_FILTER: Filter = {
  period: { unit: "month", anchor: "", from: null, to: null },
  categories: [],
  accounts: [],
  types: [],
  statuses: [],
  search: "",
  amountMin: null,
  amountMax: null,
  excluded: "hide",
};
