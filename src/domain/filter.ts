import { resolvePeriod } from "./dates.ts";
import type { Filter, TransactionRecord } from "../data/types.ts";

export function applyFilter(
  records: TransactionRecord[],
  filter: Filter,
  today: string,
): TransactionRecord[] {
  const range = resolvePeriod(filter.period, today);
  // Collapsed the same way searchBlob is, so the two agree.
  const search = filter.search.trim().replace(/\s+/gu, " ").toLowerCase();
  const categories = new Set(filter.categories);
  const accounts = new Set(filter.accounts);
  const types = new Set(filter.types);
  const statuses = new Set(filter.statuses);

  const matched = records.filter((record) => {
    if (filter.excluded === "hide" && record.excluded) return false;
    if (filter.excluded === "only" && !record.excluded) return false;

    if (range) {
      if (!record.date) return false;
      if (record.date < range.from || record.date > range.to) return false;
    }

    if (categories.size && !categories.has(record.category)) return false;

    if (accounts.size && !accounts.has(record.fromAccount) && !accounts.has(record.toAccount)) {
      return false;
    }

    if (types.size && !types.has(record.type)) return false;
    if (statuses.size && !statuses.has(record.status)) return false;
    if (search && !record.searchBlob.includes(search)) return false;

    if (filter.amountMin !== null || filter.amountMax !== null) {
      if (record.amount === null) return false;
      const magnitude = Math.abs(record.amount);
      if (filter.amountMin !== null && magnitude < filter.amountMin) return false;
      if (filter.amountMax !== null && magnitude > filter.amountMax) return false;
    }

    return true;
  });

  // Newest first. Records with no readable timestamp sort to the end.
  return matched.sort((a, b) => (b.epoch ?? -Infinity) - (a.epoch ?? -Infinity));
}

export function distinctCategories(records: TransactionRecord[]): string[] {
  const names = new Set(records.map((record) => record.category).filter(Boolean));
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function distinctAccounts(records: TransactionRecord[]): string[] {
  const names = new Set<string>();
  for (const record of records) {
    if (record.fromAccount) names.add(record.fromAccount);
    if (record.toAccount) names.add(record.toAccount);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
