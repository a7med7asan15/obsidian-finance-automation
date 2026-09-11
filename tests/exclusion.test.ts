import test from "node:test";
import assert from "node:assert/strict";
import { matchesRule, firstMatchingRule, resolveExclusion, validateRule } from "../src/domain/exclusion.ts";
import type { ExclusionRule } from "../src/domain/exclusion.ts";
import { makeTransaction } from "./helpers/factory.ts";

const rule = (overrides: Partial<ExclusionRule> = {}): ExclusionRule => ({
  id: "self-transfer-ahmed",
  name: "Transfer to my own account",
  enabled: true,
  reason: "Transfer between my own accounts",
  match: "all",
  conditions: [
    { field: "sms_message", op: "contains", value: "Ahmed Hassan" },
    { field: "from_account", op: "equals", value: "CIB" },
  ],
  ...overrides,
});

test("the motivating rule matches", () => {
  const record = makeTransaction({
    sms_message: "EGP 2000 transferred to Ahmed Hassan from your account",
    from_account: "CIB",
  });
  assert.equal(matchesRule(record, rule()), true);
});

test("match all requires every condition", () => {
  const record = makeTransaction({
    sms_message: "EGP 2000 transferred to Ahmed Hassan", from_account: "Cash",
  });
  assert.equal(matchesRule(record, rule()), false);
});

test("match any requires only one condition", () => {
  const record = makeTransaction({ sms_message: "nothing relevant", from_account: "CIB" });
  assert.equal(matchesRule(record, rule({ match: "any" })), true);
});

test("text comparison is case-insensitive", () => {
  const record = makeTransaction({ sms_message: "transferred to AHMED HASSAN", from_account: "cib" });
  assert.equal(matchesRule(record, rule()), true);
});

test("contains matches Arabic text", () => {
  const record = makeTransaction({ sms_message: "تم تحويل مبلغ 2000 جم الى احمد حسن" });
  const arabic = rule({ conditions: [{ field: "sms_message", op: "contains", value: "احمد حسن" }] });
  assert.equal(matchesRule(record, arabic), true);
});

test("every text operator behaves", () => {
  const record = makeTransaction({ merchant: "Carrefour Maadi" });
  const check = (op: string, value: string) =>
    matchesRule(record, rule({ match: "all", conditions: [{ field: "merchant", op: op as never, value }] }));

  assert.equal(check("contains", "maadi"), true);
  assert.equal(check("not_contains", "zamalek"), true);
  assert.equal(check("equals", "Carrefour Maadi"), true);
  assert.equal(check("equals", "Carrefour"), false);
  assert.equal(check("not_equals", "Carrefour"), true);
  assert.equal(check("starts_with", "carre"), true);
  assert.equal(check("ends_with", "maadi"), true);
  assert.equal(check("matches", "^Carrefour\\s+\\w+$"), true);
});

test("numeric operators work on amount", () => {
  const record = makeTransaction({ amount: 250 });
  const check = (op: string, value: number, value2?: number) =>
    matchesRule(record, rule({ conditions: [{ field: "amount", op: op as never, value, value2 }] }));

  assert.equal(check("gt", 100), true);
  assert.equal(check("gt", 250), false);
  assert.equal(check("lt", 300), true);
  assert.equal(check("between", 200, 300), true);
  assert.equal(check("between", 300, 400), false);
});

test("a numeric operator on a record with no amount does not match", () => {
  const record = makeTransaction({ amount: "" });
  assert.equal(matchesRule(record, rule({ conditions: [{ field: "amount", op: "gt", value: 0 }] })), false);
});

test("an invalid regex never matches and never throws", () => {
  const record = makeTransaction({ merchant: "Carrefour" });
  const broken = rule({ conditions: [{ field: "merchant", op: "matches", value: "([unclosed" }] });
  assert.equal(matchesRule(record, broken), false);
});

test("a disabled rule never matches", () => {
  const record = makeTransaction({ sms_message: "to Ahmed Hassan", from_account: "CIB" });
  assert.equal(matchesRule(record, rule({ enabled: false })), false);
});

test("a rule with no conditions never matches", () => {
  assert.equal(matchesRule(makeTransaction(), rule({ conditions: [] })), false);
});

test("firstMatchingRule returns the earliest match", () => {
  const record = makeTransaction({ merchant: "Carrefour" });
  const rules = [
    rule({ id: "a", enabled: false, conditions: [{ field: "merchant", op: "contains", value: "carre" }] }),
    rule({ id: "b", conditions: [{ field: "merchant", op: "contains", value: "carre" }] }),
    rule({ id: "c", conditions: [{ field: "merchant", op: "contains", value: "four" }] }),
  ];
  assert.equal(firstMatchingRule(record, rules)!.id, "b");
});

test("resolveExclusion excludes a matching record that is not yet excluded", () => {
  const record = makeTransaction({ sms_message: "to Ahmed Hassan", from_account: "CIB" });
  assert.deepEqual(resolveExclusion(record, [rule()]), {
    excluded: true,
    exclude_reason: "Transfer between my own accounts",
    exclude_source: "rule",
    exclude_rule_id: "self-transfer-ahmed",
  });
});

test("resolveExclusion returns null when nothing needs to change", () => {
  const clean = makeTransaction({ merchant: "Carrefour" });
  assert.equal(resolveExclusion(clean, [rule()]), null);

  const alreadyExcluded = makeTransaction({
    sms_message: "to Ahmed Hassan", from_account: "CIB",
    excluded: true, exclude_source: "rule", exclude_rule_id: "self-transfer-ahmed",
    exclude_reason: "Transfer between my own accounts",
  });
  assert.equal(resolveExclusion(alreadyExcluded, [rule()]), null);
});

test("resolveExclusion clears a rule exclusion when the rule stops matching", () => {
  const record = makeTransaction({
    merchant: "Carrefour", excluded: true, exclude_source: "rule",
    exclude_rule_id: "self-transfer-ahmed", exclude_reason: "Transfer between my own accounts",
  });
  assert.deepEqual(resolveExclusion(record, [rule()]), {
    excluded: false, exclude_reason: "", exclude_source: null, exclude_rule_id: "",
  });
});

test("resolveExclusion clears a rule exclusion when the rule is deleted entirely", () => {
  const record = makeTransaction({
    excluded: true, exclude_source: "rule", exclude_rule_id: "gone", exclude_reason: "whatever",
  });
  assert.deepEqual(resolveExclusion(record, []), {
    excluded: false, exclude_reason: "", exclude_source: null, exclude_rule_id: "",
  });
});

test("a manual exclusion is never touched by any rule", () => {
  const excludedByHand = makeTransaction({
    merchant: "Carrefour", excluded: true, exclude_source: "manual", exclude_reason: "Never happened",
  });
  assert.equal(resolveExclusion(excludedByHand, [rule()]), null);
  assert.equal(resolveExclusion(excludedByHand, []), null);
});

test("a rule does not re-exclude a record a rule already excluded under a different rule id", () => {
  const record = makeTransaction({
    sms_message: "to Ahmed Hassan", from_account: "CIB",
    excluded: true, exclude_source: "rule", exclude_rule_id: "older-rule", exclude_reason: "old reason",
  });
  assert.deepEqual(resolveExclusion(record, [rule()]), {
    excluded: true,
    exclude_reason: "Transfer between my own accounts",
    exclude_source: "rule",
    exclude_rule_id: "self-transfer-ahmed",
  });
});

test("validateRule reports every problem it finds", () => {
  assert.deepEqual(validateRule(rule()), []);
  assert.ok(validateRule({ ...rule(), id: "" }).some((message) => message.includes("id")));
  assert.ok(validateRule({ ...rule(), name: "" }).some((message) => message.includes("name")));
  assert.ok(validateRule({ ...rule(), conditions: [] }).some((message) => message.includes("condition")));
  assert.ok(
    validateRule({ ...rule(), conditions: [{ field: "nope", op: "contains", value: "x" }] })
      .some((message) => message.includes("field")),
  );
  assert.ok(
    validateRule({ ...rule(), conditions: [{ field: "merchant", op: "nope", value: "x" }] })
      .some((message) => message.includes("operator")),
  );
  assert.ok(
    validateRule({ ...rule(), conditions: [{ field: "merchant", op: "matches", value: "([bad" }] })
      .some((message) => message.includes("regular expression")),
  );
  assert.ok(
    validateRule({ ...rule(), conditions: [{ field: "amount", op: "between", value: 100 }] })
      .some((message) => message.includes("two values")),
  );
});
