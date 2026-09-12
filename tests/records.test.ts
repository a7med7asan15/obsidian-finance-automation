import test from "node:test";
import assert from "node:assert/strict";
import { buildTransaction, buildAccount, buildCategory, isTransactionPath, parserChanges } from "../src/data/records.ts";

test("buildTransaction maps every field and derives date parts", () => {
  const record = buildTransaction({
    type: "transaction",
    timestamp: "2026-08-29T14:35:02+03:00",
    amount: "1,420.50",
    currency: "EGP",
    from_account: "CIB",
    to_account: "",
    category: "Groceries",
    merchant: "Carrefour",
    transaction_type: "debit",
    status: "parsed",
    source: "iphone-shortcut-sms",
    sms_message: "Card 0774 purchase EGP 1,420.50 at Carrefour",
    parser_confidence: 0.8,
    transaction_id: "abc123",
  }, "Budget/Transactions/2026/Aug/29T14-35-02.md");

  assert.equal(record.amount, 1420.5);
  assert.equal(record.date, "2026-08-29");
  assert.equal(record.month, "2026-08");
  assert.equal(record.year, "2026");
  assert.equal(record.time, "14:35");
  assert.equal(record.fromAccount, "CIB");
  assert.equal(record.type, "debit");
  assert.equal(record.excluded, false);
  assert.equal(record.excludeSource, null);
});

test("buildTransaction defaults an unknown status to pending", () => {
  const record = buildTransaction({ status: "nonsense" }, "Budget/Transactions/x.md");
  assert.equal(record.status, "pending");
});

test("buildTransaction defaults an unknown transaction_type to empty", () => {
  const record = buildTransaction({ transaction_type: "wat" }, "Budget/Transactions/x.md");
  assert.equal(record.type, "");
});

test("buildTransaction defaults a missing category to Uncategorized", () => {
  const record = buildTransaction({}, "Budget/Transactions/x.md");
  assert.equal(record.category, "Uncategorized");
});

test("buildTransaction survives an unreadable timestamp", () => {
  const record = buildTransaction({ timestamp: "garbage" }, "Budget/Transactions/x.md");
  assert.equal(record.date, null);
  assert.equal(record.month, null);
  assert.equal(record.epoch, null);
});

test("buildTransaction reads the exclusion fields", () => {
  const record = buildTransaction({
    excluded: true, exclude_reason: "Duplicate SMS",
    exclude_source: "rule", exclude_rule_id: "self-transfer-ahmed",
  }, "Budget/Transactions/x.md");
  assert.equal(record.excluded, true);
  assert.equal(record.excludeReason, "Duplicate SMS");
  assert.equal(record.excludeSource, "rule");
  assert.equal(record.excludeRuleId, "self-transfer-ahmed");
});

test("buildTransaction rejects an unknown exclude_source", () => {
  const record = buildTransaction({ excluded: true, exclude_source: "robot" }, "Budget/Transactions/x.md");
  assert.equal(record.excludeSource, "manual");
});

test("searchBlob is lower-cased and covers merchant, sms, category and accounts", () => {
  const record = buildTransaction({
    merchant: "Carrefour", sms_message: "Purchase at CARREFOUR Maadi",
    category: "Groceries", from_account: "CIB",
  }, "Budget/Transactions/x.md");
  assert.ok(record.searchBlob.includes("carrefour"));
  assert.ok(record.searchBlob.includes("maadi"));
  assert.ok(record.searchBlob.includes("groceries"));
  assert.ok(record.searchBlob.includes("cib"));
  assert.equal(record.searchBlob, record.searchBlob.toLowerCase());
});

test("buildAccount falls back to the file basename for the name", () => {
  const account = buildAccount({ type: "account", currency: "EGP" }, "Budget/Accounts/CIB.md");
  assert.equal(account.name, "CIB");
});

test("buildAccount reads opening balance and keeps the legacy balance as a reference", () => {
  const account = buildAccount({
    type: "account", name: "CIB", currency: "EGP", account_type: "bank",
    opening_balance: "10,000", opening_date: "2026-01-01",
    balance: 9450, balance_updated_at: "2026-09-01T00:00:00",
    card_ending: "0774", active: true, include_in_net_worth: true,
  }, "Budget/Accounts/CIB.md");

  assert.equal(account.openingBalance, 10000);
  assert.equal(account.openingDate, "2026-01-01");
  assert.equal(account.referenceBalance, 9450);
  assert.deepEqual(account.cardEndings, ["0774"]);
});

test("buildAccount defaults openingBalance to zero and openingDate to null", () => {
  const account = buildAccount({ type: "account" }, "Budget/Accounts/Cash.md");
  assert.equal(account.openingBalance, 0);
  assert.equal(account.openingDate, null);
  assert.equal(account.referenceBalance, null);
});

test("buildCategory reads colour, icon and budget", () => {
  const category = buildCategory({
    type: "category", name: "Groceries", currency: "EGP",
    color: "#3B82F6", icon: "shopping-cart", monthly_budget: "5,000",
  }, "Budget/Settings/Categories/Groceries.md");
  assert.equal(category.color, "#3B82F6");
  assert.equal(category.icon, "shopping-cart");
  assert.equal(category.monthlyBudget, 5000);
});

test("buildCategory leaves colour, icon and budget null when unset", () => {
  const category = buildCategory({ type: "category" }, "Budget/Settings/Categories/Bills.md");
  assert.equal(category.color, null);
  assert.equal(category.icon, null);
  assert.equal(category.monthlyBudget, null);
});

test("isTransactionPath accepts transaction notes and rejects the README", () => {
  assert.equal(isTransactionPath("Budget/Transactions/2026/Aug/29T14-35-02.md"), true);
  assert.equal(isTransactionPath("Budget/Transactions/README.md"), false);
  assert.equal(isTransactionPath("Budget/Accounts/CIB.md"), false);
  assert.equal(isTransactionPath("Budget/Transactions/2026/Aug/notes.txt"), false);
});

test("parserChanges fills empty fields and the parser-owned keys", () => {
  const record = buildTransaction(
    {
      timestamp: "2026-09-11T20:15:09.203Z",
      sms_message: "تم خصم EGP 350.00",
      category: "Uncategorized",
      status: "needs_review",
      parser_confidence: 0,
      transaction_id: "aee0fb590d45575d",
    },
    "Budget/Transactions/2026/Sep/11T20-15-09.md",
  );

  const changes = parserChanges(record, {
    amount: 350,
    currency: "EGP",
    category: "Dining",
    status: "parsed",
    parser_confidence: 1,
    transaction_id: "aee0fb590d45575d",
  });

  assert.deepEqual(changes, {
    amount: 350,
    currency: "EGP",
    category: "Dining",
    status: "parsed",
    parser_confidence: 1,
  });
});

test("parserChanges never rewrites a field with the value it already holds", () => {
  // A needs_review note is reparsed on every pass, and a frontmatter write fires
  // the modify event that schedules the next one. Identical values counting as
  // changes is what let such a note rewrite itself without end.
  const frontmatter = {
    timestamp: "2026-09-11T19:14:11.222Z",
    sms_message: "تم",
    category: "Uncategorized",
    status: "needs_review",
    parser_confidence: 0,
    transaction_id: "f36041700d000314",
  };
  const record = buildTransaction(frontmatter, "Budget/Transactions/2026/Sep/11T19-14-11.md");

  const parsed = {
    amount: null,
    currency: "",
    from_account: "",
    to_account: "",
    category: "Uncategorized",
    merchant: "",
    transaction_type: "",
    status: "needs_review",
    parser_confidence: 0,
    transaction_id: "f36041700d000314",
  };

  assert.deepEqual(parserChanges(record, parsed), {});
});

test("parserChanges keeps a value set by hand", () => {
  const record = buildTransaction(
    { timestamp: "2026-09-11T19:14:11.222Z", merchant: "Cancun Resort", category: "Dining", status: "needs_review" },
    "Budget/Transactions/2026/Sep/11T19-14-11.md",
  );

  const changes = parserChanges(record, { merchant: "CANCUN RESORT   SPA", category: "Uncategorized" });

  assert.deepEqual(changes, {});
});
