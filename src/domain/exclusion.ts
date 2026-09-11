import type { ExcludeSource, TransactionRecord } from "../data/types.ts";

export const RULE_FIELDS = [
  "sms_message", "merchant", "from_account", "to_account",
  "category", "transaction_type", "amount", "timestamp",
] as const;
export type RuleField = (typeof RULE_FIELDS)[number];

export const RULE_OPS = [
  "contains", "not_contains", "equals", "not_equals",
  "starts_with", "ends_with", "matches", "gt", "lt", "between",
] as const;
export type RuleOp = (typeof RULE_OPS)[number];

const NUMERIC_OPS: ReadonlySet<string> = new Set(["gt", "lt", "between"]);

export interface RuleCondition {
  field: RuleField;
  op: RuleOp;
  value: string | number;
  /** Only used by `between`. */
  value2?: string | number;
}

export interface ExclusionRule {
  id: string;
  name: string;
  enabled: boolean;
  reason: string;
  match: "all" | "any";
  conditions: RuleCondition[];
}

export interface ExclusionChange {
  excluded: boolean;
  exclude_reason: string;
  exclude_source: ExcludeSource;
  exclude_rule_id: string;
}

function textOf(record: TransactionRecord, field: RuleField): string {
  switch (field) {
    case "sms_message": return record.smsMessage;
    case "merchant": return record.merchant;
    case "from_account": return record.fromAccount;
    case "to_account": return record.toAccount;
    case "category": return record.category;
    case "transaction_type": return record.type;
    case "timestamp": return record.timestamp;
    case "amount": return record.amount === null ? "" : String(record.amount);
  }
}

function numberOf(record: TransactionRecord, field: RuleField): number | null {
  if (field === "amount") return record.amount;
  const parsed = Number(textOf(record, field));
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesCondition(record: TransactionRecord, condition: RuleCondition): boolean {
  if (NUMERIC_OPS.has(condition.op)) {
    const actual = numberOf(record, condition.field);
    if (actual === null) return false;
    const first = Number(condition.value);
    if (!Number.isFinite(first)) return false;
    if (condition.op === "gt") return actual > first;
    if (condition.op === "lt") return actual < first;
    const second = Number(condition.value2);
    if (!Number.isFinite(second)) return false;
    const low = Math.min(first, second);
    const high = Math.max(first, second);
    return actual >= low && actual <= high;
  }

  const actual = textOf(record, condition.field).toLowerCase();
  const expected = String(condition.value ?? "").trim().toLowerCase();

  switch (condition.op) {
    case "contains": return actual.includes(expected);
    case "not_contains": return !actual.includes(expected);
    case "equals": return actual === expected;
    case "not_equals": return actual !== expected;
    case "starts_with": return actual.startsWith(expected);
    case "ends_with": return actual.endsWith(expected);
    case "matches":
      try {
        // A broken pattern must never take down a render or a processing run.
        return new RegExp(String(condition.value), "iu").test(textOf(record, condition.field));
      } catch {
        return false;
      }
    default: return false;
  }
}

export function matchesRule(record: TransactionRecord, rule: ExclusionRule): boolean {
  if (!rule.enabled) return false;
  if (!rule.conditions.length) return false;
  return rule.match === "any"
    ? rule.conditions.some((condition) => matchesCondition(record, condition))
    : rule.conditions.every((condition) => matchesCondition(record, condition));
}

export function firstMatchingRule(
  record: TransactionRecord,
  rules: ExclusionRule[],
): ExclusionRule | null {
  return rules.find((rule) => matchesRule(record, rule)) ?? null;
}

const CLEARED: ExclusionChange = {
  excluded: false, exclude_reason: "", exclude_source: null, exclude_rule_id: "",
};

/**
 * Returns the frontmatter change a note needs, or null when it already agrees
 * with the rules. A manual exclusion is never modified — that is the property
 * that makes rules safe to edit and re-apply.
 */
export function resolveExclusion(
  record: TransactionRecord,
  rules: ExclusionRule[],
): ExclusionChange | null {
  if (record.excluded && record.excludeSource === "manual") return null;

  const rule = firstMatchingRule(record, rules);

  if (!rule) {
    if (record.excluded && record.excludeSource === "rule") return CLEARED;
    return null;
  }

  const desired: ExclusionChange = {
    excluded: true,
    exclude_reason: rule.reason || rule.name,
    exclude_source: "rule",
    exclude_rule_id: rule.id,
  };

  const unchanged =
    record.excluded &&
    record.excludeSource === "rule" &&
    record.excludeRuleId === desired.exclude_rule_id &&
    record.excludeReason === desired.exclude_reason;

  return unchanged ? null : desired;
}

export function validateRule(rule: unknown): string[] {
  const errors: string[] = [];
  const candidate = rule as Partial<ExclusionRule>;

  if (!candidate || typeof candidate !== "object") return ["Rule must be an object."];
  if (!String(candidate.id ?? "").trim()) errors.push("Rule needs an id.");
  if (!String(candidate.name ?? "").trim()) errors.push("Rule needs a name.");
  if (candidate.match !== "all" && candidate.match !== "any") {
    errors.push("Rule match must be 'all' or 'any'.");
  }

  const conditions = Array.isArray(candidate.conditions) ? candidate.conditions : [];
  if (!conditions.length) errors.push("Rule needs at least one condition.");

  conditions.forEach((condition, position) => {
    const where = `Condition ${position + 1}`;
    if (!RULE_FIELDS.includes(condition?.field as RuleField)) {
      errors.push(`${where} has an unknown field.`);
      return;
    }
    if (!RULE_OPS.includes(condition?.op as RuleOp)) {
      errors.push(`${where} has an unknown operator.`);
      return;
    }
    if (condition.op === "matches") {
      try {
        new RegExp(String(condition.value), "iu");
      } catch (error) {
        errors.push(`${where} is not a valid regular expression: ${(error as Error).message}`);
      }
    }
    if (condition.op === "between" && !Number.isFinite(Number(condition.value2))) {
      errors.push(`${where} needs two values.`);
    }
    if (NUMERIC_OPS.has(condition.op) && !Number.isFinite(Number(condition.value))) {
      errors.push(`${where} needs a number.`);
    }
    if (!NUMERIC_OPS.has(condition.op) && !String(condition.value ?? "").trim()) {
      errors.push(`${where} needs a value.`);
    }
  });

  return errors;
}
