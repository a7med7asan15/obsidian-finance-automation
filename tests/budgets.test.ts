import test from "node:test";
import assert from "node:assert/strict";
import { budgetProgress } from "../src/domain/budgets.ts";
import { buildCategory } from "../src/data/records.ts";
import { makeTransaction } from "./helpers/factory.ts";

const category = (name: string, budget: unknown, currency = "EGP") =>
  buildCategory({ type: "category", name, currency, monthly_budget: budget },
    `Budget/Settings/Categories/${name}.md`);

test("progress reports spent, remaining and ratio", () => {
  const categories = [category("Groceries", 5000)];
  const records = [
    makeTransaction({ category: "Groceries", amount: 1200, transaction_type: "debit" }),
    makeTransaction({ category: "Groceries", amount: 800, transaction_type: "debit" }),
  ];
  const [progress] = budgetProgress(categories, records);
  assert.equal(progress.spent, 2000);
  assert.equal(progress.remaining, 3000);
  assert.equal(progress.ratio, 0.4);
  assert.equal(progress.level, "ok");
});

test("level turns warn at 80 percent and over past 100", () => {
  const categories = [category("Dining", 1000)];
  const at79 = budgetProgress(categories, [makeTransaction({ category: "Dining", amount: 790, transaction_type: "debit" })]);
  const at80 = budgetProgress(categories, [makeTransaction({ category: "Dining", amount: 800, transaction_type: "debit" })]);
  const at101 = budgetProgress(categories, [makeTransaction({ category: "Dining", amount: 1010, transaction_type: "debit" })]);
  assert.equal(at79[0].level, "ok");
  assert.equal(at80[0].level, "warn");
  assert.equal(at101[0].level, "over");
  assert.equal(at101[0].remaining, -10);
});

test("categories with no budget are omitted", () => {
  const categories = [category("Groceries", 5000), category("Bills", "")];
  const progress = budgetProgress(categories, []);
  assert.deepEqual(progress.map((item) => item.category), ["Groceries"]);
});

test("a zero budget is omitted rather than dividing by zero", () => {
  assert.deepEqual(budgetProgress([category("Fees", 0)], []), []);
});

test("spend is matched per currency", () => {
  const categories = [category("Groceries", 5000, "EGP")];
  const records = [
    makeTransaction({ category: "Groceries", amount: 1000, currency: "EGP", transaction_type: "debit" }),
    makeTransaction({ category: "Groceries", amount: 900, currency: "USD", transaction_type: "debit" }),
  ];
  assert.equal(budgetProgress(categories, records)[0].spent, 1000);
});

test("excluded records and income do not count against a budget", () => {
  const categories = [category("Groceries", 5000)];
  const records = [
    makeTransaction({ category: "Groceries", amount: 1000, transaction_type: "debit" }),
    makeTransaction({ category: "Groceries", amount: 4000, transaction_type: "debit", excluded: true }),
    makeTransaction({ category: "Groceries", amount: 200, transaction_type: "credit" }),
  ];
  assert.equal(budgetProgress(categories, records)[0].spent, 1000);
});

test("results are ordered most-used first", () => {
  const categories = [category("Groceries", 5000), category("Dining", 1000)];
  const records = [
    makeTransaction({ category: "Groceries", amount: 500, transaction_type: "debit" }),
    makeTransaction({ category: "Dining", amount: 900, transaction_type: "debit" }),
  ];
  assert.deepEqual(budgetProgress(categories, records).map((item) => item.category), ["Dining", "Groceries"]);
});
