import { addMonths, daysBetween } from "./dates.ts";
import { cleanCounterpartyName, counterpartyKey } from "./counterparty.ts";
import type { CounterpartyRole, TransactionRecord } from "../data/types.ts";

export interface Totals {
  income: number;
  expenses: number;
  transfers: number;
  net: number;
  count: number;
}

function emptyTotals(): Totals {
  return { income: 0, expenses: 0, transfers: 0, net: 0, count: 0 };
}

/** A record counts only when it has a usable amount and is not excluded. */
function counts(record: TransactionRecord): boolean {
  return !record.excluded && record.amount !== null;
}

function magnitude(record: TransactionRecord): number {
  return Math.abs(record.amount ?? 0);
}

/** Expenses are debits and fees. Transfers are never income or expense. */
function isExpense(record: TransactionRecord): boolean {
  return record.type === "debit" || record.type === "fee";
}

export function totalsByCurrency(records: TransactionRecord[]): Map<string, Totals> {
  const result = new Map<string, Totals>();
  for (const record of records) {
    // Every currency present in the data gets a bucket, even when the record
    // itself contributes nothing, so callers can read a zeroed total rather
    // than having to distinguish "no spend" from "currency unknown".
    const currency = record.currency || "Unknown";
    const totals = result.get(currency) ?? emptyTotals();
    result.set(currency, totals);
    if (!counts(record)) continue;
    const value = magnitude(record);
    totals.count += 1;
    if (record.type === "credit") totals.income += value;
    else if (isExpense(record)) totals.expenses += value;
    else if (record.type === "transfer") totals.transfers += value;
    totals.net = totals.income - totals.expenses;
  }
  return result;
}

function sumBy(
  records: TransactionRecord[],
  currency: string,
  keyOf: (record: TransactionRecord) => string | null,
  labelOf: (record: TransactionRecord) => string,
): Array<{ key: string; label: string; amount: number; count: number }> {
  const buckets = new Map<string, { label: string; amount: number; count: number }>();
  for (const record of records) {
    if (!counts(record) || record.currency !== currency || !isExpense(record)) continue;
    const key = keyOf(record);
    if (!key) continue;
    const bucket = buckets.get(key) ?? { label: labelOf(record), amount: 0, count: 0 };
    bucket.amount += magnitude(record);
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets]
    .map(([key, bucket]) => ({ key, ...bucket }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}

export function spendByCategory(
  records: TransactionRecord[],
  currency: string,
): Array<{ category: string; amount: number; count: number }> {
  return sumBy(records, currency, (record) => record.category, (record) => record.category)
    .map(({ label, amount, count }) => ({ category: label, amount, count }));
}

export function spendByMerchant(
  records: TransactionRecord[],
  currency: string,
  limit: number,
): Array<{ merchant: string; amount: number; count: number }> {
  return sumBy(
    records,
    currency,
    (record) => (record.counterparty ? record.counterparty.toLowerCase() : null),
    (record) => record.counterparty,
  )
    .slice(0, limit)
    .map(({ label, amount, count }) => ({ merchant: label, amount, count }));
}

export function spendByDay(
  records: TransactionRecord[],
  currency: string,
  from: string,
  to: string,
): Array<{ date: string; amount: number }> {
  const byDate = new Map<string, number>();
  for (const record of records) {
    if (!counts(record) || record.currency !== currency || !isExpense(record) || !record.date) continue;
    byDate.set(record.date, (byDate.get(record.date) ?? 0) + magnitude(record));
  }
  return daysBetween(from, to).map((date) => ({ date, amount: byDate.get(date) ?? 0 }));
}

export function spendByMonth(
  records: TransactionRecord[],
  currency: string,
  fromMonth: string,
  toMonth: string,
): Array<{ month: string; amount: number }> {
  const byMonth = new Map<string, number>();
  for (const record of records) {
    if (!counts(record) || record.currency !== currency || !isExpense(record) || !record.month) continue;
    byMonth.set(record.month, (byMonth.get(record.month) ?? 0) + magnitude(record));
  }
  const months: Array<{ month: string; amount: number }> = [];
  let cursor = fromMonth;
  while (cursor <= toMonth) {
    months.push({ month: cursor, amount: byMonth.get(cursor) ?? 0 });
    cursor = addMonths(cursor, 1);
  }
  return months;
}

export function groupByDay(
  records: TransactionRecord[],
): Array<{ date: string; records: TransactionRecord[]; totals: Map<string, Totals> }> {
  const buckets = new Map<string, TransactionRecord[]>();
  for (const record of records) {
    const date = record.date ?? "";
    const bucket = buckets.get(date) ?? [];
    bucket.push(record);
    buckets.set(date, bucket);
  }
  return [...buckets]
    // Newest first; the empty-date bucket sorts last because "" is smallest.
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, dayRecords]) => ({ date, records: dayRecords, totals: totalsByCurrency(dayRecords) }));
}

export function primaryCurrency(records: TransactionRecord[]): string {
  const counted = new Map<string, number>();
  for (const record of records) {
    if (!record.currency) continue;
    counted.set(record.currency, (counted.get(record.currency) ?? 0) + 1);
  }
  const ranked = [...counted].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked[0]?.[0] ?? "EGP";
}

export interface CounterpartyTotal {
  /** The folded name two spellings of one shop share. */
  key: string;
  /** The longest spelling seen, which is usually the most complete one. */
  name: string;
  roles: CounterpartyRole[];
  count: number;
  /** Magnitudes, so both read as positive money. */
  spent: number;
  received: number;
  /** The currency most of this party's transactions are in. */
  currency: string;
  /** Every category its transactions carry, sorted. */
  categories: string[];
  /** The one category they agree on, or "" when they disagree. */
  category: string;
  lastDate: string | null;
  /** Every note, so a category can be applied to the lot. */
  paths: string[];
}

/**
 * Every party named across these transactions, one row each, biggest first.
 *
 * This is the list to categorise from: a shop appears once however many times
 * you visited it, carrying the categories its transactions currently hold, so
 * the ones still sitting in Uncategorized stand out. Excluded transactions are
 * listed too — a party you have decided to ignore still needs a name — and the
 * caller decides what to feed in, so the period and filters in the Budget view
 * scope the list the same way they scope everything else.
 */
export function counterpartySummary(records: TransactionRecord[]): CounterpartyTotal[] {
  const buckets = new Map<string, CounterpartyTotal & { currencies: Map<string, number> }>();

  for (const record of records) {
    const name = cleanCounterpartyName(record.counterparty);
    if (!name) continue;
    const key = counterpartyKey(name);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key, name, roles: [], count: 0, spent: 0, received: 0, currency: "",
        categories: [], category: "", lastDate: null, paths: [],
        currencies: new Map<string, number>(),
      };
      buckets.set(key, bucket);
    }

    if (name.length > bucket.name.length) bucket.name = name;
    if (record.counterpartyRole && !bucket.roles.includes(record.counterpartyRole)) {
      bucket.roles.push(record.counterpartyRole);
    }
    bucket.count += 1;
    const value = Math.abs(record.amount ?? 0);
    if (record.type === "credit") bucket.received += value;
    else bucket.spent += value;
    if (record.currency) {
      bucket.currencies.set(record.currency, (bucket.currencies.get(record.currency) ?? 0) + 1);
    }
    if (record.category && !bucket.categories.includes(record.category)) {
      bucket.categories.push(record.category);
    }
    if (record.date && (!bucket.lastDate || record.date > bucket.lastDate)) {
      bucket.lastDate = record.date;
    }
    bucket.paths.push(record.path);
  }

  const totals: CounterpartyTotal[] = [];
  for (const bucket of buckets.values()) {
    const ranked = [...bucket.currencies].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    totals.push({
      key: bucket.key,
      name: bucket.name,
      roles: bucket.roles,
      count: bucket.count,
      spent: bucket.spent,
      received: bucket.received,
      currency: ranked[0]?.[0] ?? "",
      categories: [...bucket.categories].sort((a, b) => a.localeCompare(b)),
      category: bucket.categories.length === 1 ? bucket.categories[0]! : "",
      lastDate: bucket.lastDate,
      paths: bucket.paths,
    });
  }

  return totals.sort(
    (a, b) => b.spent + b.received - (a.spent + a.received) || a.name.localeCompare(b.name),
  );
}

export interface CategoryTotal {
  name: string;
  count: number;
  /** Magnitudes, so both read as positive money. */
  spent: number;
  received: number;
  /** The currency most of this category's transactions are in. */
  currency: string;
  lastDate: string | null;
}

/**
 * Every category these transactions carry, one row each, biggest first.
 *
 * The sibling of `counterpartySummary`, and read the same way: it counts what
 * the transactions say, so a category with no note of its own still appears,
 * and a category whose note exists but whose period is empty does not. The
 * Categories tab adds the notes back, because a category you are about to give
 * a budget has to be visible before it has been spent against.
 *
 * Transfers count as spent, since a category row is about how much money the
 * name moved, not which direction the bank called it.
 */
export function categorySummary(records: TransactionRecord[]): CategoryTotal[] {
  const buckets = new Map<string, CategoryTotal & { currencies: Map<string, number> }>();

  for (const record of records) {
    const name = record.category || "Uncategorized";
    let bucket = buckets.get(name);
    if (!bucket) {
      bucket = {
        name, count: 0, spent: 0, received: 0, currency: "", lastDate: null,
        currencies: new Map<string, number>(),
      };
      buckets.set(name, bucket);
    }

    bucket.count += 1;
    const value = magnitude(record);
    if (record.type === "credit") bucket.received += value;
    else bucket.spent += value;
    if (record.currency) {
      bucket.currencies.set(record.currency, (bucket.currencies.get(record.currency) ?? 0) + 1);
    }
    if (record.date && (!bucket.lastDate || record.date > bucket.lastDate)) {
      bucket.lastDate = record.date;
    }
  }

  const totals: CategoryTotal[] = [];
  for (const bucket of buckets.values()) {
    const ranked = [...bucket.currencies].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    totals.push({
      name: bucket.name,
      count: bucket.count,
      spent: bucket.spent,
      received: bucket.received,
      currency: ranked[0]?.[0] ?? "",
      lastDate: bucket.lastDate,
    });
  }

  return totals.sort(
    (a, b) => b.spent + b.received - (a.spent + a.received) || a.name.localeCompare(b.name),
  );
}
