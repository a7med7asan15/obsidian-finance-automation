import type { TransactionRecord, TransactionType } from "../data/types.ts";
import { counterpartyFields, roleForType } from "./counterparty.ts";
import { firstMatchingRule, validateRule, type BaseRule } from "./exclusion.ts";

export type RuleType = Exclude<TransactionType, "">;

export const RULE_TYPES: RuleType[] = ["debit", "credit", "transfer", "fee"];

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  debit: "Spending",
  credit: "Income",
  transfer: "Transfer",
  fee: "Fee",
};

/**
 * Decides what a message counts as when the keywords in `sms_patterns` get it
 * wrong for one merchant or one wording — a cashback the bank words like a
 * purchase, a salary that arrives as a "transfer".
 */
export interface TypeRule extends BaseRule {
  type: RuleType;
}

/**
 * Where the account goes for a type. Money out is on the `from` side and money
 * in on the `to` side, so changing a debit into a credit moves the one account
 * the note names across; a transfer keeps both sides as they are.
 */
export function placeAccounts(
  record: Pick<TransactionRecord, "fromAccount" | "toAccount">,
  type: TransactionType,
): { from_account: string; to_account: string } {
  if (type === "debit" || type === "fee") {
    return { from_account: record.fromAccount || record.toAccount, to_account: "" };
  }
  if (type === "credit") {
    return { from_account: "", to_account: record.toAccount || record.fromAccount };
  }
  return { from_account: record.fromAccount, to_account: record.toAccount };
}

/** Every frontmatter key that changes along with the type. */
function retype(record: TransactionRecord, type: TransactionType): Record<string, unknown> {
  return {
    transaction_type: type,
    ...placeAccounts(record, type),
    // Only rename the key the party sits under when there is a party: an empty
    // name written under all three keys would say nothing new.
    ...(record.counterparty ? counterpartyFields(record.counterparty, roleForType(type)) : {}),
  };
}

/**
 * The frontmatter change a note needs, or null when it already agrees with the
 * rules.
 *
 * Only a transaction read from a message is touched — one typed in by hand has
 * the type its author chose — and a type corrected by hand (`type_source:
 * manual`) is never changed. Rules are matched against the note as the parser
 * left it, not as an earlier rule rewrote it, so a condition on the type or an
 * account cannot flip a note back and forth between passes.
 */
export function resolveTypeRule(
  record: TransactionRecord,
  rules: TypeRule[],
): Record<string, unknown> | null {
  if (!record.smsMessage || record.typeSource === "manual") return null;

  const ruled = record.typeSource === "rule";
  const baseline: TransactionType = ruled ? record.typeBeforeRule : record.type;
  const placed = placeAccounts(record, baseline);
  const base: TransactionRecord = ruled
    ? { ...record, type: baseline, fromAccount: placed.from_account, toAccount: placed.to_account }
    : record;

  const rule = firstMatchingRule(base, rules);

  if (!rule) {
    if (!ruled) return null;
    return { ...retype(base, baseline), type_source: null, type_rule_id: null, type_before_rule: null };
  }

  if (ruled && record.typeRuleId === rule.id && record.type === rule.type) return null;
  // Already what the rule wants, and nobody else's decision: there is nothing to
  // record, and a later edit to the keywords stays free to change it.
  if (!ruled && record.type === rule.type) return null;

  return {
    ...retype(base, rule.type),
    type_source: "rule",
    type_rule_id: rule.id,
    type_before_rule: baseline,
  };
}

export function validateTypeRule(rule: unknown): string[] {
  const errors = validateRule(rule);
  const type = (rule as Partial<TypeRule> | null)?.type;
  if (!RULE_TYPES.includes(type as RuleType)) {
    errors.push(`Rule type must be one of ${RULE_TYPES.join(", ")}.`);
  }
  return errors;
}
