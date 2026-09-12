import test from "node:test";
import assert from "node:assert/strict";
import {
  totalsByCurrency, spendByCategory, spendByMerchant, spendByDay, spendByMonth,
  groupByDay, primaryCurrency, counterpartySummary,
} from "../src/domain/aggregate.ts";
import { makeTransaction } from "./helpers/factory.ts";

test("totals split income, expenses and transfers", () => {
  const records = [
    makeTransaction({ transaction_type: "debit", amount: 100 }),
    makeTransaction({ transaction_type: "fee", amount: 25 }),
    makeTransaction({ transaction_type: "credit", amount: 5000 }),
    makeTransaction({ transaction_type: "transfer", amount: 300 }),
  ];
  const totals = totalsByCurrency(records).get("EGP")!;
  assert.equal(totals.income, 5000);
  assert.equal(totals.expenses, 125);
  assert.equal(totals.transfers, 300);
  assert.equal(totals.net, 4875);
  assert.equal(totals.count, 4);
});

test("a fee counts as an expense", () => {
  const totals = totalsByCurrency([makeTransaction({ transaction_type: "fee", amount: 25 })]).get("EGP")!;
  assert.equal(totals.expenses, 25);
});

test("excluded records contribute nothing at all", () => {
  const records = [
    makeTransaction({ transaction_type: "debit", amount: 100 }),
    makeTransaction({ transaction_type: "debit", amount: 999, excluded: true }),
  ];
  const totals = totalsByCurrency(records).get("EGP")!;
  assert.equal(totals.expenses, 100);
  assert.equal(totals.count, 1);
});

test("records with no amount contribute nothing", () => {
  const totals = totalsByCurrency([makeTransaction({ amount: "" })]).get("EGP")!;
  assert.equal(totals.expenses, 0);
  assert.equal(totals.count, 0);
});

test("currencies never mix", () => {
  const records = [
    makeTransaction({ currency: "EGP", amount: 100 }),
    makeTransaction({ currency: "USD", amount: 20 }),
  ];
  const totals = totalsByCurrency(records);
  assert.equal(totals.get("EGP")!.expenses, 100);
  assert.equal(totals.get("USD")!.expenses, 20);
  assert.equal(totals.size, 2);
});

test("amounts are treated as magnitudes regardless of sign", () => {
  const records = [
    makeTransaction({ transaction_type: "debit", amount: -100 }),
    makeTransaction({ transaction_type: "debit", amount: 100 }),
  ];
  assert.equal(totalsByCurrency(records).get("EGP")!.expenses, 200);
});

test("spendByCategory excludes transfers and income, sorted descending", () => {
  const records = [
    makeTransaction({ category: "Groceries", amount: 100, transaction_type: "debit" }),
    makeTransaction({ category: "Groceries", amount: 50, transaction_type: "debit" }),
    makeTransaction({ category: "Dining", amount: 400, transaction_type: "debit" }),
    makeTransaction({ category: "Income", amount: 9000, transaction_type: "credit" }),
    makeTransaction({ category: "Transfer", amount: 700, transaction_type: "transfer" }),
  ];
  assert.deepEqual(spendByCategory(records, "EGP"), [
    { category: "Dining", amount: 400, count: 1 },
    { category: "Groceries", amount: 150, count: 2 },
  ]);
});

test("spendByMerchant groups case-insensitively and honours the limit", () => {
  const records = [
    makeTransaction({ merchant: "Carrefour", amount: 100, transaction_type: "debit" }),
    makeTransaction({ merchant: "carrefour", amount: 50, transaction_type: "debit" }),
    makeTransaction({ merchant: "Seoudi", amount: 400, transaction_type: "debit" }),
    makeTransaction({ merchant: "Uber", amount: 30, transaction_type: "debit" }),
  ];
  const top = spendByMerchant(records, "EGP", 2);
  assert.equal(top.length, 2);
  assert.deepEqual(top[0], { merchant: "Seoudi", amount: 400, count: 1 });
  assert.deepEqual(top[1], { merchant: "Carrefour", amount: 150, count: 2 });
});

test("spendByMerchant skips records with no merchant", () => {
  const records = [makeTransaction({ merchant: "", amount: 100, transaction_type: "debit" })];
  assert.deepEqual(spendByMerchant(records, "EGP", 10), []);
});

test("spendByDay emits every day in range including empty ones", () => {
  const records = [
    makeTransaction({ timestamp: "2026-09-02T10:00:00+03:00", amount: 100, transaction_type: "debit" }),
    makeTransaction({ timestamp: "2026-09-02T18:00:00+03:00", amount: 40, transaction_type: "debit" }),
    makeTransaction({ timestamp: "2026-09-04T10:00:00+03:00", amount: 70, transaction_type: "debit" }),
  ];
  assert.deepEqual(spendByDay(records, "EGP", "2026-09-01", "2026-09-04"), [
    { date: "2026-09-01", amount: 0 },
    { date: "2026-09-02", amount: 140 },
    { date: "2026-09-03", amount: 0 },
    { date: "2026-09-04", amount: 70 },
  ]);
});

test("spendByMonth emits every month in range", () => {
  const records = [
    makeTransaction({ timestamp: "2026-01-15T10:00:00+03:00", amount: 100, transaction_type: "debit" }),
    makeTransaction({ timestamp: "2026-03-15T10:00:00+03:00", amount: 300, transaction_type: "debit" }),
  ];
  assert.deepEqual(spendByMonth(records, "EGP", "2026-01", "2026-03"), [
    { month: "2026-01", amount: 100 },
    { month: "2026-02", amount: 0 },
    { month: "2026-03", amount: 300 },
  ]);
});

test("groupByDay groups, orders newest first, and totals each day", () => {
  const records = [
    makeTransaction({ timestamp: "2026-09-02T10:00:00+03:00", amount: 100, transaction_type: "debit" }),
    makeTransaction({ timestamp: "2026-09-04T10:00:00+03:00", amount: 70, transaction_type: "debit" }),
    makeTransaction({ timestamp: "2026-09-02T18:00:00+03:00", amount: 40, transaction_type: "debit" }),
  ];
  const groups = groupByDay(records);
  assert.deepEqual(groups.map((group) => group.date), ["2026-09-04", "2026-09-02"]);
  assert.equal(groups[1].records.length, 2);
  assert.equal(groups[1].totals.get("EGP")!.expenses, 140);
});

test("groupByDay keeps excluded records visible but out of the day total", () => {
  const records = [
    makeTransaction({ timestamp: "2026-09-02T10:00:00+03:00", amount: 100, transaction_type: "debit" }),
    makeTransaction({ timestamp: "2026-09-02T11:00:00+03:00", amount: 999, transaction_type: "debit", excluded: true }),
  ];
  const [group] = groupByDay(records);
  assert.equal(group.records.length, 2);
  assert.equal(group.totals.get("EGP")!.expenses, 100);
});

test("groupByDay puts undated records in their own bucket last", () => {
  const records = [makeTransaction({ timestamp: "garbage" }), makeTransaction()];
  const groups = groupByDay(records);
  assert.equal(groups.at(-1)!.date, "");
});

test("primaryCurrency is the one with the most records", () => {
  const records = [
    makeTransaction({ currency: "USD" }),
    makeTransaction({ currency: "EGP" }),
    makeTransaction({ currency: "EGP" }),
  ];
  assert.equal(primaryCurrency(records), "EGP");
  assert.equal(primaryCurrency([]), "EGP");
});

// --- the list of everyone the money met ---

test("counterpartySummary gives one row per name, biggest first", () => {
  const rows = counterpartySummary([
    makeTransaction({ merchant: "Carrefour", amount: 100 }),
    makeTransaction({ merchant: "carrefour", amount: 50 }),
    makeTransaction({ merchant: "Seoudi", amount: 400 }),
  ]);
  assert.deepEqual(rows.map((row) => [row.name, row.count, row.spent]), [
    ["Seoudi", 1, 400],
    ["Carrefour", 2, 150],
  ]);
});

test("a bank's padding and letter case do not split one shop into two rows", () => {
  const rows = counterpartySummary([
    makeTransaction({ merchant: "CANCUN RESORT   SPA", amount: 350 }),
    makeTransaction({ merchant: "Cancun Resort Spa", amount: 200 }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.name, "CANCUN RESORT SPA");
  assert.equal(rows[0]!.count, 2);
  assert.equal(rows[0]!.spent, 550);
});

test("money in and money out are kept apart, and every role is listed", () => {
  const rows = counterpartySummary([
    makeTransaction({ sender: "ACME", merchant: "", transaction_type: "credit", amount: 12000 }),
    makeTransaction({ merchant: "ACME", transaction_type: "debit", amount: 300 }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.received, 12000);
  assert.equal(rows[0]!.spent, 300);
  assert.deepEqual(rows[0]!.roles.sort(), ["merchant", "sender"]);
});

test("a party carries the categories its transactions hold", () => {
  const [agreed] = counterpartySummary([
    makeTransaction({ merchant: "Seoudi", category: "Groceries" }),
    makeTransaction({ merchant: "Seoudi", category: "Groceries" }),
  ]);
  assert.deepEqual(agreed!.categories, ["Groceries"]);
  assert.equal(agreed!.category, "Groceries");

  const [mixed] = counterpartySummary([
    makeTransaction({ merchant: "Seoudi", category: "Groceries" }),
    makeTransaction({ merchant: "Seoudi", category: "Dining" }),
  ]);
  assert.deepEqual(mixed!.categories, ["Dining", "Groceries"]);
  // No single answer is true yet, so the row offers none.
  assert.equal(mixed!.category, "");
});

test("a party carries every note path, so one choice can file the lot", () => {
  const [row] = counterpartySummary([
    makeTransaction({ merchant: "Seoudi" }),
    makeTransaction({ merchant: "Seoudi" }),
  ]);
  assert.equal(row!.paths.length, 2);
  assert.ok(row!.paths.every((path) => path.startsWith("Budget/Transactions/")));
});

test("the last date and the dominant currency come along", () => {
  const [row] = counterpartySummary([
    makeTransaction({ merchant: "Seoudi", timestamp: "2026-09-01T12:00:00+03:00", currency: "EGP" }),
    makeTransaction({ merchant: "Seoudi", timestamp: "2026-09-09T12:00:00+03:00", currency: "EGP" }),
    makeTransaction({ merchant: "Seoudi", timestamp: "2026-09-05T12:00:00+03:00", currency: "USD" }),
  ]);
  assert.equal(row!.lastDate, "2026-09-09");
  assert.equal(row!.currency, "EGP");
});

test("transactions naming nobody are left out of the list", () => {
  assert.deepEqual(counterpartySummary([makeTransaction({ merchant: "", amount: 100 })]), []);
});

test("an excluded transaction still lists its party", () => {
  const rows = counterpartySummary([
    makeTransaction({ merchant: "Seoudi", excluded: true, exclude_source: "manual" }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.count, 1);
});
