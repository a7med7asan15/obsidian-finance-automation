export type TransactionType = "debit" | "credit" | "transfer" | "fee" | "";
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
  merchant: string;
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
  /** Lower-cased merchant + sms + category + accounts, for substring search. */
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
