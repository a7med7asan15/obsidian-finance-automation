import test from "node:test";
import assert from "node:assert/strict";
import { deriveBalances, netWorthByCurrency, unknownAccountNames } from "../src/domain/balances.ts";
import { buildAccount } from "../src/data/records.ts";
import { makeTransaction } from "./helpers/factory.ts";

const account = (overrides: Record<string, unknown> = {}) =>
  buildAccount({ type: "account", name: "CIB", currency: "EGP", account_type: "bank", ...overrides },
    `Budget/Accounts/${overrides.name ?? "CIB"}.md`);

test("balance is opening balance minus debits plus credits", () => {
  const accounts = [account({ opening_balance: 10000 })];
  const records = [
    makeTransaction({ transaction_type: "debit", amount: 400, from_account: "CIB" }),
    makeTransaction({ transaction_type: "credit", amount: 1500, from_account: "", to_account: "CIB" }),
  ];
  const [result] = deriveBalances(accounts, records);
  assert.equal(result.balance, 11100);
  assert.equal(result.moneyOut, 400);
  assert.equal(result.moneyIn, 1500);
  assert.equal(result.transactionCount, 2);
});

test("a fee reduces the balance", () => {
  const records = [makeTransaction({ transaction_type: "fee", amount: 25, from_account: "CIB" })];
  assert.equal(deriveBalances([account({ opening_balance: 1000 })], records)[0].balance, 975);
});

test("a transfer moves money out of one account and into the other", () => {
  const accounts = [
    account({ name: "CIB", opening_balance: 5000 }),
    account({ name: "Cash", opening_balance: 0 }),
  ];
  const records = [
    makeTransaction({ transaction_type: "transfer", amount: 800, from_account: "CIB", to_account: "Cash" }),
  ];
  const balances = deriveBalances(accounts, records);
  assert.equal(balances.find((item) => item.account.name === "CIB")!.balance, 4200);
  assert.equal(balances.find((item) => item.account.name === "Cash")!.balance, 800);
});

test("excluded transactions never move a balance", () => {
  const records = [
    makeTransaction({ transaction_type: "debit", amount: 400, from_account: "CIB" }),
    makeTransaction({ transaction_type: "debit", amount: 9999, from_account: "CIB", excluded: true }),
  ];
  assert.equal(deriveBalances([account({ opening_balance: 10000 })], records)[0].balance, 9600);
});

test("transactions before opening_date are ignored", () => {
  const accounts = [account({ opening_balance: 10000, opening_date: "2026-09-01" })];
  const records = [
    makeTransaction({ timestamp: "2026-08-20T10:00:00+03:00", transaction_type: "debit", amount: 500, from_account: "CIB" }),
    makeTransaction({ timestamp: "2026-09-02T10:00:00+03:00", transaction_type: "debit", amount: 300, from_account: "CIB" }),
  ];
  assert.equal(deriveBalances(accounts, records)[0].balance, 9700);
});

test("a transaction on opening_date itself is counted", () => {
  const accounts = [account({ opening_balance: 1000, opening_date: "2026-09-02" })];
  const records = [
    makeTransaction({ timestamp: "2026-09-02T10:00:00+03:00", transaction_type: "debit", amount: 300, from_account: "CIB" }),
  ];
  assert.equal(deriveBalances(accounts, records)[0].balance, 700);
});

test("account matching is case-insensitive and trims whitespace", () => {
  const records = [makeTransaction({ transaction_type: "debit", amount: 100, from_account: "  cib " })];
  assert.equal(deriveBalances([account({ opening_balance: 500 })], records)[0].balance, 400);
});

test("records with no amount are ignored", () => {
  const records = [makeTransaction({ transaction_type: "debit", amount: "", from_account: "CIB" })];
  const [result] = deriveBalances([account({ opening_balance: 500 })], records);
  assert.equal(result.balance, 500);
  assert.equal(result.transactionCount, 0);
});

test("drift is the reference balance minus the derived balance, or null when absent", () => {
  const records = [makeTransaction({ transaction_type: "debit", amount: 100, from_account: "CIB" })];
  const withReference = deriveBalances([account({ opening_balance: 1000, balance: 880 })], records)[0];
  assert.equal(withReference.balance, 900);
  assert.equal(withReference.drift, -20);
  assert.equal(deriveBalances([account({ opening_balance: 1000 })], records)[0].drift, null);
});

test("inactive accounts are excluded entirely", () => {
  const accounts = [account({ name: "CIB" }), account({ name: "Old", active: false })];
  assert.deepEqual(deriveBalances(accounts, []).map((item) => item.account.name), ["CIB"]);
});

test("net worth sums per currency and respects include_in_net_worth", () => {
  const accounts = [
    account({ name: "CIB", currency: "EGP", opening_balance: 5000 }),
    account({ name: "Cash", currency: "EGP", opening_balance: 300 }),
    account({ name: "Wise", currency: "USD", opening_balance: 200 }),
    account({ name: "Loan", currency: "EGP", opening_balance: -1000, include_in_net_worth: false }),
  ];
  const netWorth = netWorthByCurrency(deriveBalances(accounts, []));
  assert.equal(netWorth.get("EGP"), 5300);
  assert.equal(netWorth.get("USD"), 200);
});

test("unknownAccountNames lists names used by transactions but not configured", () => {
  const accounts = [account({ name: "CIB" })];
  const records = [
    makeTransaction({ from_account: "CIB" }),
    makeTransaction({ from_account: "Card ••••1234" }),
    makeTransaction({ from_account: "", to_account: "Vodafone Cash" }),
  ];
  assert.deepEqual(unknownAccountNames(accounts, records), ["Card ••••1234", "Vodafone Cash"]);
});
