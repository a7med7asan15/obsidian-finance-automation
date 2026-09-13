import test from "node:test";
import assert from "node:assert/strict";
import { applyFilter, distinctCategories, distinctAccounts } from "../src/domain/filter.ts";
import { DEFAULT_FILTER } from "../src/data/types.ts";
import type { Filter } from "../src/data/types.ts";
import { makeTransaction } from "./helpers/factory.ts";

const TODAY = "2026-09-11";
const filterOf = (overrides: Partial<Filter> = {}): Filter => ({ ...DEFAULT_FILTER, ...overrides });

test("the default filter keeps the current month and hides excluded", () => {
  const records = [
    makeTransaction({ timestamp: "2026-09-05T12:00:00+03:00" }),
    makeTransaction({ timestamp: "2026-08-05T12:00:00+03:00" }),
    makeTransaction({ timestamp: "2026-09-07T12:00:00+03:00", excluded: true }),
  ];
  const result = applyFilter(records, filterOf(), TODAY);
  assert.equal(result.length, 1);
  assert.equal(result[0].date, "2026-09-05");
});

test("a year period keeps every month of that year", () => {
  const records = [
    makeTransaction({ timestamp: "2026-01-05T12:00:00+03:00" }),
    makeTransaction({ timestamp: "2026-12-31T12:00:00+03:00" }),
    makeTransaction({ timestamp: "2025-12-31T12:00:00+03:00" }),
  ];
  const filter = filterOf({ period: { unit: "year", anchor: "2026", from: null, to: null } });
  assert.equal(applyFilter(records, filter, TODAY).length, 2);
});

test("all time keeps records whose date could not be parsed", () => {
  const records = [makeTransaction({ timestamp: "garbage" }), makeTransaction()];
  const filter = filterOf({ period: { unit: "all", anchor: "", from: null, to: null } });
  assert.equal(applyFilter(records, filter, TODAY).length, 2);
});

test("a bounded period drops records whose date could not be parsed", () => {
  const records = [makeTransaction({ timestamp: "garbage" }), makeTransaction()];
  assert.equal(applyFilter(records, filterOf(), TODAY).length, 1);
});

test("category filter is a union", () => {
  const records = [
    makeTransaction({ category: "Groceries" }),
    makeTransaction({ category: "Dining" }),
    makeTransaction({ category: "Bills" }),
  ];
  const filter = filterOf({ categories: ["Groceries", "Dining"] });
  assert.equal(applyFilter(records, filter, TODAY).length, 2);
});

test("account filter matches either side of the transaction", () => {
  const records = [
    makeTransaction({ from_account: "CIB", to_account: "" }),
    makeTransaction({ from_account: "", to_account: "CIB" }),
    makeTransaction({ from_account: "Cash", to_account: "" }),
  ];
  const filter = filterOf({ accounts: ["CIB"] });
  assert.equal(applyFilter(records, filter, TODAY).length, 2);
});

test("type filter", () => {
  const records = [
    makeTransaction({ transaction_type: "debit" }),
    makeTransaction({ transaction_type: "credit" }),
    makeTransaction({ transaction_type: "transfer" }),
  ];
  assert.equal(applyFilter(records, filterOf({ types: ["credit", "transfer"] }), TODAY).length, 2);
});

test("status filter", () => {
  const records = [
    makeTransaction({ status: "parsed" }),
    makeTransaction({ status: "pending" }),
    makeTransaction({ status: "pending" }),
  ];
  assert.equal(applyFilter(records, filterOf({ statuses: ["pending"] }), TODAY).length, 2);
});

test("a search typed with single spaces finds a padded message", () => {
  const records = [makeTransaction({ merchant: "CANCUN RESORT   SPA" })];
  const found = applyFilter(records, filterOf({ search: "cancun resort spa" }), TODAY);
  assert.equal(found.length, 1);
});

test("search matches merchant, SMS body, category and account, case-insensitively", () => {
  const records = [
    makeTransaction({ merchant: "Carrefour" }),
    makeTransaction({ merchant: "Seoudi", sms_message: "purchase at CARREFOUR maadi" }),
    makeTransaction({ merchant: "Uber", category: "Transport" }),
  ];
  assert.equal(applyFilter(records, filterOf({ search: "carrefour" }), TODAY).length, 2);
  assert.equal(applyFilter(records, filterOf({ search: "TRANSPORT" }), TODAY).length, 1);
});

test("search matches an Arabic SMS body", () => {
  const records = [
    makeTransaction({ sms_message: "تم خصم مبلغ 250 جم من حساب" }),
    makeTransaction({ sms_message: "purchase at Carrefour" }),
  ];
  assert.equal(applyFilter(records, filterOf({ search: "خصم" }), TODAY).length, 1);
});

test("amount range is inclusive at both ends", () => {
  const records = [
    makeTransaction({ amount: 50 }), makeTransaction({ amount: 100 }), makeTransaction({ amount: 150 }),
  ];
  const filter = filterOf({ amountMin: 50, amountMax: 100 });
  assert.equal(applyFilter(records, filter, TODAY).length, 2);
});

test("amount range compares the absolute amount", () => {
  const records = [makeTransaction({ amount: -120 })];
  assert.equal(applyFilter(records, filterOf({ amountMin: 100 }), TODAY).length, 1);
});

test("excluded mode: hide, show and only", () => {
  const records = [makeTransaction(), makeTransaction({ excluded: true })];
  assert.equal(applyFilter(records, filterOf({ excluded: "hide" }), TODAY).length, 1);
  assert.equal(applyFilter(records, filterOf({ excluded: "show" }), TODAY).length, 2);
  const only = applyFilter(records, filterOf({ excluded: "only" }), TODAY);
  assert.equal(only.length, 1);
  assert.equal(only[0].excluded, true);
});

test("filters combine with AND", () => {
  const records = [
    makeTransaction({ category: "Groceries", from_account: "CIB", amount: 100 }),
    makeTransaction({ category: "Groceries", from_account: "Cash", amount: 100 }),
    makeTransaction({ category: "Dining", from_account: "CIB", amount: 100 }),
  ];
  const filter = filterOf({ categories: ["Groceries"], accounts: ["CIB"] });
  assert.equal(applyFilter(records, filter, TODAY).length, 1);
});

test("results are ordered newest first", () => {
  const records = [
    makeTransaction({ timestamp: "2026-09-01T09:00:00+03:00" }),
    makeTransaction({ timestamp: "2026-09-08T09:00:00+03:00" }),
    makeTransaction({ timestamp: "2026-09-04T09:00:00+03:00" }),
  ];
  const result = applyFilter(records, filterOf(), TODAY);
  assert.deepEqual(result.map((item) => item.date), ["2026-09-08", "2026-09-04", "2026-09-01"]);
});

test("distinctCategories and distinctAccounts are sorted and deduplicated", () => {
  const records = [
    makeTransaction({ category: "Dining", from_account: "CIB", to_account: "" }),
    makeTransaction({ category: "Bills", from_account: "Cash", to_account: "CIB" }),
    makeTransaction({ category: "Dining", from_account: "CIB", to_account: "" }),
  ];
  assert.deepEqual(distinctCategories(records), ["Bills", "Dining"]);
  // Locale-aware sort, so "Cash" precedes "CIB" the way a reader expects.
  assert.deepEqual(distinctAccounts(records), ["Cash", "CIB"]);
});
