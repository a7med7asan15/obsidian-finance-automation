import { spendByCategory } from "./aggregate.ts";
import type { CategoryRecord, TransactionRecord } from "../data/types.ts";

export type BudgetLevel = "ok" | "warn" | "over";

export interface BudgetProgress {
  category: string;
  currency: string;
  budget: number;
  spent: number;
  remaining: number;
  /** spent / budget. Can exceed 1. */
  ratio: number;
  level: BudgetLevel;
}

const WARN_AT = 0.8;

export function budgetProgress(
  categories: CategoryRecord[],
  records: TransactionRecord[],
): BudgetProgress[] {
  const spendByCurrency = new Map<string, Map<string, number>>();

  const progress: BudgetProgress[] = [];
  for (const category of categories) {
    if (category.monthlyBudget === null || category.monthlyBudget <= 0) continue;

    if (!spendByCurrency.has(category.currency)) {
      const totals = new Map(
        spendByCategory(records, category.currency).map((item) => [item.category, item.amount]),
      );
      spendByCurrency.set(category.currency, totals);
    }

    const spent = spendByCurrency.get(category.currency)!.get(category.name) ?? 0;
    const budget = category.monthlyBudget;
    const ratio = spent / budget;
    progress.push({
      category: category.name,
      currency: category.currency,
      budget,
      spent,
      remaining: budget - spent,
      ratio,
      level: ratio > 1 ? "over" : ratio >= WARN_AT ? "warn" : "ok",
    });
  }

  return progress.sort((a, b) => b.ratio - a.ratio || a.category.localeCompare(b.category));
}
