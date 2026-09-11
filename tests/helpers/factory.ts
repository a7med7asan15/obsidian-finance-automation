import { buildTransaction } from "../../src/data/records.ts";
import type { TransactionRecord } from "../../src/data/types.ts";

let counter = 0;

/** Builds a realistic transaction. Pass raw frontmatter keys, not record keys. */
export function makeTransaction(overrides: Record<string, unknown> = {}): TransactionRecord {
  counter += 1;
  return buildTransaction(
    {
      type: "transaction",
      timestamp: "2026-09-05T12:00:00+03:00",
      amount: 100,
      currency: "EGP",
      from_account: "CIB",
      to_account: "",
      category: "Groceries",
      merchant: "Carrefour",
      transaction_type: "debit",
      status: "parsed",
      source: "test",
      ...overrides,
    },
    `Budget/Transactions/2026/Sep/05T12-00-${String(counter).padStart(2, "0")}.md`,
  );
}
