import test from "node:test";
import assert from "node:assert/strict";
import { placeAccounts, resolveTypeRule, validateTypeRule } from "../src/domain/type-rules.ts";
import type { TypeRule } from "../src/domain/type-rules.ts";
import { withChanges } from "../src/data/records.ts";
import { makeTransaction } from "./helpers/factory.ts";

const cashback = (overrides: Partial<TypeRule> = {}): TypeRule => ({
  id: "cashback",
  name: "Cashback is income",
  enabled: true,
  type: "credit",
  match: "all",
  conditions: [{ field: "sms_message", op: "contains", value: "cashback" }],
  ...overrides,
});

const purchaseWordedCashback = () =>
  makeTransaction({
    sms_message: "Cashback of EGP 50 charged to card 1234",
    transaction_type: "debit",
    from_account: "CIB",
    to_account: "",
    merchant: "Valu",
  });

test("a matching rule turns spending into income and moves the account across", () => {
  const changes = resolveTypeRule(purchaseWordedCashback(), [cashback()]);
  assert.deepEqual(changes, {
    transaction_type: "credit",
    from_account: "",
    to_account: "CIB",
    merchant: "",
    recipient: "",
    sender: "Valu",
    type_source: "rule",
    type_rule_id: "cashback",
    type_before_rule: "debit",
  });
});

test("a note the rule already changed is left alone", () => {
  const record = purchaseWordedCashback();
  const applied = withChanges(record, resolveTypeRule(record, [cashback()])!);
  assert.equal(resolveTypeRule(applied, [cashback()]), null);
});

test("turning the rule off puts the note back the way the parser read it", () => {
  const record = purchaseWordedCashback();
  const applied = withChanges(record, resolveTypeRule(record, [cashback()])!);
  const reverted = resolveTypeRule(applied, [cashback({ enabled: false })]);
  assert.deepEqual(reverted, {
    transaction_type: "debit",
    from_account: "CIB",
    to_account: "",
    merchant: "Valu",
    recipient: "",
    sender: "",
    type_source: null,
    type_rule_id: null,
    type_before_rule: null,
  });
});

test("a rule matching on the type it changes does not flip back and forth", () => {
  const rule = cashback({
    conditions: [
      { field: "sms_message", op: "contains", value: "cashback" },
      { field: "transaction_type", op: "equals", value: "debit" },
    ],
  });
  const record = purchaseWordedCashback();
  const applied = withChanges(record, resolveTypeRule(record, [rule])!);
  assert.equal(applied.type, "credit");
  assert.equal(resolveTypeRule(applied, [rule]), null);
});

test("a type set by hand is never changed", () => {
  const record = makeTransaction({
    sms_message: "Cashback of EGP 50", transaction_type: "debit", type_source: "manual",
  });
  assert.equal(resolveTypeRule(record, [cashback()]), null);
});

test("a transaction typed in by hand, with no message, is never changed", () => {
  const record = makeTransaction({ merchant: "cashback shop", transaction_type: "debit" });
  const rule = cashback({ conditions: [{ field: "merchant", op: "contains", value: "cashback" }] });
  assert.equal(resolveTypeRule(record, [rule]), null);
});

test("a note already of the rule's type needs nothing written", () => {
  const record = makeTransaction({
    sms_message: "Cashback credited", transaction_type: "credit", from_account: "", to_account: "CIB",
  });
  assert.equal(resolveTypeRule(record, [cashback()]), null);
});

test("the first matching rule wins", () => {
  const fee = cashback({ id: "fee", type: "fee" });
  const changes = resolveTypeRule(purchaseWordedCashback(), [fee, cashback()]);
  assert.equal(changes?.transaction_type, "fee");
});

test("switching from one rule to another keeps the parser's type to return to", () => {
  const record = purchaseWordedCashback();
  const applied = withChanges(record, resolveTypeRule(record, [cashback()])!);
  const fee = cashback({ id: "fee", type: "fee" });
  const changes = resolveTypeRule(applied, [fee]);
  assert.equal(changes?.transaction_type, "fee");
  assert.equal(changes?.from_account, "CIB");
  assert.equal(changes?.type_before_rule, "debit");
});

test("placeAccounts keeps both sides of a transfer", () => {
  assert.deepEqual(
    placeAccounts({ fromAccount: "CIB", toAccount: "Cash" }, "transfer"),
    { from_account: "CIB", to_account: "Cash" },
  );
});

test("a type rule needs a type it knows", () => {
  assert.deepEqual(validateTypeRule(cashback()), []);
  assert.ok(validateTypeRule({ ...cashback(), type: "income" }).some((error) => error.includes("type")));
});
