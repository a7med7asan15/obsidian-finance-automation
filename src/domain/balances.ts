import type { AccountRecord, TransactionRecord } from "../data/types.ts";

export interface AccountBalance {
  account: AccountRecord;
  balance: number;
  moneyIn: number;
  moneyOut: number;
  transactionCount: number;
  /** referenceBalance − derived balance, or null when no statement figure is recorded. */
  drift: number | null;
}

const key = (name: string): string => name.trim().toLowerCase();

export function deriveBalances(
  accounts: AccountRecord[],
  records: TransactionRecord[],
): AccountBalance[] {
  const active = accounts.filter((account) => account.active);
  const byKey = new Map(active.map((account) => [key(account.name), account]));

  const state = new Map<string, { moneyIn: number; moneyOut: number; count: number }>();
  for (const account of active) state.set(key(account.name), { moneyIn: 0, moneyOut: 0, count: 0 });

  for (const record of records) {
    if (record.excluded || record.amount === null) continue;
    const value = Math.abs(record.amount);

    const apply = (name: string, direction: "in" | "out"): boolean => {
      const accountKey = key(name);
      const account = byKey.get(accountKey);
      if (!account) return false;
      // A transaction before the opening balance was struck is already baked into it.
      if (account.openingDate && record.date && record.date < account.openingDate) return false;
      const bucket = state.get(accountKey)!;
      if (direction === "in") bucket.moneyIn += value;
      else bucket.moneyOut += value;
      bucket.count += 1;
      return true;
    };

    if (record.type === "credit") {
      apply(record.toAccount || record.fromAccount, "in");
    } else if (record.type === "debit" || record.type === "fee") {
      apply(record.fromAccount, "out");
    } else if (record.type === "transfer") {
      apply(record.fromAccount, "out");
      apply(record.toAccount, "in");
    }
  }

  return active.map((account) => {
    const bucket = state.get(key(account.name))!;
    const balance = account.openingBalance + bucket.moneyIn - bucket.moneyOut;
    return {
      account,
      balance,
      moneyIn: bucket.moneyIn,
      moneyOut: bucket.moneyOut,
      transactionCount: bucket.count,
      drift: account.referenceBalance === null ? null : account.referenceBalance - balance,
    };
  });
}

export function netWorthByCurrency(balances: AccountBalance[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of balances) {
    if (!item.account.includeInNetWorth) continue;
    const currency = item.account.currency || "Unknown";
    result.set(currency, (result.get(currency) ?? 0) + item.balance);
  }
  return result;
}

export function unknownAccountNames(
  accounts: AccountRecord[],
  records: TransactionRecord[],
): string[] {
  const known = new Set(accounts.map((account) => key(account.name)));
  const unknown = new Map<string, string>();
  for (const record of records) {
    for (const name of [record.fromAccount, record.toAccount]) {
      if (!name) continue;
      if (known.has(key(name))) continue;
      if (!unknown.has(key(name))) unknown.set(key(name), name.trim());
    }
  }
  return [...unknown.values()].sort((a, b) => a.localeCompare(b));
}
