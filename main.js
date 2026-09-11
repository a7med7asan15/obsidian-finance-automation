"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => FinanceAutomationPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian13 = require("obsidian");

// src/constants.ts
var VAULT_ROOT = "Budget/";
var TRANSACTIONS_DIR = `${VAULT_ROOT}Transactions`;
var ACCOUNTS_DIR = `${VAULT_ROOT}Accounts`;
var SETTINGS_DIR = `${VAULT_ROOT}Settings`;
var CATEGORIES_DIR = `${SETTINGS_DIR}/Categories`;
var RULES_PATH = `${SETTINGS_DIR}/exclusion_rules.json`;
var CONFIG_PATH = `${SETTINGS_DIR}/config.json`;
var ACCOUNTS_JSON_PATH = `${SETTINGS_DIR}/accounts.json`;
var CATEGORY_RULES_PATH = `${CATEGORIES_DIR}/rules.json`;

// src/data/index-store.ts
var import_obsidian = require("obsidian");

// src/data/frontmatter.ts
function readString(value) {
  if (value === null || value === void 0) return "";
  return String(value).trim();
}
function readNumber(value) {
  if (value === null || value === void 0 || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}
var TRUE_VALUES = /* @__PURE__ */ new Set(["true", "yes", "y", "1", "on"]);
var FALSE_VALUES = /* @__PURE__ */ new Set(["false", "no", "n", "0", "off"]);
function readBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === null || value === void 0 || value === "") return fallback;
  const text = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(text)) return true;
  if (FALSE_VALUES.has(text)) return false;
  return fallback;
}
function readStringList(value) {
  if (value === null || value === void 0) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.map(readString).filter((item) => item.length > 0);
}

// src/domain/dates.ts
var TIMEZONE = "Africa/Cairo";
var MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
var SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var CAIRO_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});
function formatInCairo(instant) {
  const parts = CAIRO_FORMAT.formatToParts(instant);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${hour}:${get("minute")}` };
}
function toDateParts(timestamp) {
  const text = String(timestamp ?? "").trim();
  if (!text) return null;
  const naive = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (naive) {
    const [, year, month, day, hour, minute, second] = naive;
    const epoch = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second ?? "00"}+03:00`);
    return {
      date: `${year}-${month}-${day}`,
      month: `${year}-${month}`,
      year,
      time: `${hour}:${minute}`,
      epoch: Number.isNaN(epoch) ? 0 : epoch
    };
  }
  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const epoch = Date.parse(`${year}-${month}-${day}T00:00:00+03:00`);
    return {
      date: `${year}-${month}-${day}`,
      month: `${year}-${month}`,
      year,
      time: "00:00",
      epoch: Number.isNaN(epoch) ? 0 : epoch
    };
  }
  const instant = new Date(text);
  if (Number.isNaN(instant.getTime())) return null;
  const { date, time } = formatInCairo(instant);
  return { date, month: date.slice(0, 7), year: date.slice(0, 4), time, epoch: instant.getTime() };
}
function cairoToday(now = /* @__PURE__ */ new Date()) {
  return formatInCairo(now).date;
}
function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function resolvePeriod(period, today) {
  if (period.unit === "all") return null;
  if (period.unit === "custom") {
    const from = period.from ?? today;
    const to = period.to ?? today;
    return from <= to ? { from, to } : { from: to, to: from };
  }
  if (period.unit === "year") {
    const year2 = /^\d{4}$/.test(period.anchor) ? period.anchor : today.slice(0, 4);
    return { from: `${year2}-01-01`, to: `${year2}-12-31` };
  }
  const anchor = /^\d{4}-\d{2}$/.test(period.anchor) ? period.anchor : today.slice(0, 7);
  const [year, month] = anchor.split("-").map(Number);
  const last = String(lastDayOfMonth(year, month)).padStart(2, "0");
  return { from: `${anchor}-01`, to: `${anchor}-${last}` };
}
function addMonths(anchor, delta) {
  const [year, month] = anchor.split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = total % 12 + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}
function stepPeriod(period, delta) {
  if (period.unit === "month") return { ...period, anchor: addMonths(period.anchor, delta) };
  if (period.unit === "year") return { ...period, anchor: String(Number(period.anchor) + delta) };
  return period;
}
function longDate(date) {
  const [year, month, day] = date.split("-");
  return `${Number(day)} ${SHORT_MONTHS[Number(month) - 1]} ${year}`;
}
function periodLabel(period) {
  if (period.unit === "all") return "All time";
  if (period.unit === "year") return period.anchor;
  if (period.unit === "custom") {
    return `${longDate(period.from ?? "")} \u2013 ${longDate(period.to ?? "")}`;
  }
  const [year, month] = period.anchor.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

// src/data/records.ts
var TYPES = ["debit", "credit", "transfer", "fee"];
var STATUSES = ["pending", "parsed", "needs_review"];
function basename(path) {
  return path.split("/").pop()?.replace(/\.md$/, "") ?? path;
}
function isTransactionPath(path) {
  return path.startsWith(`${TRANSACTIONS_DIR}/`) && path.endsWith(".md") && path !== `${TRANSACTIONS_DIR}/README.md`;
}
function buildTransaction(frontmatter, path) {
  const timestamp = readString(frontmatter.timestamp);
  const parts = toDateParts(timestamp);
  const rawType = readString(frontmatter.transaction_type).toLowerCase();
  const type = TYPES.includes(rawType) ? rawType : "";
  const rawStatus = readString(frontmatter.status).toLowerCase();
  const status = STATUSES.includes(rawStatus) ? rawStatus : "pending";
  const excluded = readBoolean(frontmatter.excluded, false);
  const rawSource = readString(frontmatter.exclude_source).toLowerCase();
  const excludeSource = !excluded ? null : rawSource === "rule" ? "rule" : "manual";
  const merchant = readString(frontmatter.merchant);
  const smsMessage = readString(frontmatter.sms_message);
  const category = readString(frontmatter.category) || "Uncategorized";
  const fromAccount = readString(frontmatter.from_account);
  const toAccount = readString(frontmatter.to_account);
  return {
    path,
    timestamp,
    date: parts?.date ?? null,
    month: parts?.month ?? null,
    year: parts?.year ?? null,
    time: parts?.time ?? null,
    epoch: parts?.epoch ?? null,
    amount: readNumber(frontmatter.amount),
    currency: readString(frontmatter.currency),
    fromAccount,
    toAccount,
    category,
    merchant,
    type,
    status,
    source: readString(frontmatter.source),
    smsMessage,
    parserConfidence: readNumber(frontmatter.parser_confidence),
    transactionId: readString(frontmatter.transaction_id),
    excluded,
    excludeReason: readString(frontmatter.exclude_reason),
    excludeSource,
    excludeRuleId: readString(frontmatter.exclude_rule_id),
    searchBlob: [merchant, smsMessage, category, fromAccount, toAccount].filter(Boolean).join(" ").toLowerCase()
  };
}
function buildAccount(frontmatter, path) {
  const cardEndings = readStringList(frontmatter.card_endings);
  const singleEnding = readString(frontmatter.card_ending);
  if (singleEnding && !cardEndings.includes(singleEnding)) cardEndings.push(singleEnding);
  return {
    path,
    name: readString(frontmatter.name) || basename(path),
    currency: readString(frontmatter.currency) || "EGP",
    accountType: readString(frontmatter.account_type) || "bank",
    cardEndings,
    aliases: readStringList(frontmatter.aliases),
    openingBalance: readNumber(frontmatter.opening_balance) ?? 0,
    openingDate: readString(frontmatter.opening_date) || null,
    referenceBalance: readNumber(frontmatter.balance),
    referenceUpdatedAt: readString(frontmatter.balance_updated_at) || null,
    active: readBoolean(frontmatter.active, true),
    includeInNetWorth: readBoolean(frontmatter.include_in_net_worth, true),
    institution: readString(frontmatter.institution)
  };
}
function buildCategory(frontmatter, path) {
  return {
    path,
    name: readString(frontmatter.name) || basename(path),
    currency: readString(frontmatter.currency) || "EGP",
    color: readString(frontmatter.color) || null,
    icon: readString(frontmatter.icon) || null,
    monthlyBudget: readNumber(frontmatter.monthly_budget)
  };
}
var RECORD_KEYS = {
  amount: "amount",
  currency: "currency",
  from_account: "fromAccount",
  to_account: "toAccount",
  category: "category",
  merchant: "merchant",
  transaction_type: "type",
  status: "status",
  parser_confidence: "parserConfidence",
  transaction_id: "transactionId"
};
function toRecordKey(frontmatterKey) {
  return RECORD_KEYS[frontmatterKey] ?? null;
}

// src/data/index-store.ts
var TransactionIndex = class {
  constructor(app) {
    this.transactionMap = /* @__PURE__ */ new Map();
    this.accountMap = /* @__PURE__ */ new Map();
    this.categoryMap = /* @__PURE__ */ new Map();
    this.listeners = /* @__PURE__ */ new Set();
    this.notifyHandle = null;
    this.app = app;
  }
  build() {
    this.transactionMap.clear();
    this.accountMap.clear();
    this.categoryMap.clear();
    for (const file of this.app.vault.getMarkdownFiles()) this.ingest(file);
    this.notify();
  }
  registerEvents(plugin) {
    plugin.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        this.ingest(file);
        this.notify();
      })
    );
    plugin.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.forget(file.path);
        this.notify();
      })
    );
    plugin.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.forget(oldPath);
        if (file instanceof import_obsidian.TFile) this.ingest(file);
        this.notify();
      })
    );
  }
  refreshPath(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof import_obsidian.TFile) this.ingest(file);
    this.notify();
  }
  forget(path) {
    this.transactionMap.delete(path);
    this.accountMap.delete(path);
    this.categoryMap.delete(path);
  }
  ingest(file) {
    if (file.extension !== "md") return;
    this.forget(file.path);
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) return;
    const type = String(frontmatter.type ?? "");
    if (type === "transaction" && isTransactionPath(file.path)) {
      this.transactionMap.set(file.path, buildTransaction(frontmatter, file.path));
    } else if (type === "account" && file.path.startsWith(`${ACCOUNTS_DIR}/`)) {
      this.accountMap.set(file.path, buildAccount(frontmatter, file.path));
    } else if (type === "category" && file.path.startsWith(`${CATEGORIES_DIR}/`)) {
      this.categoryMap.set(file.path, buildCategory(frontmatter, file.path));
    }
  }
  /** Coalesces bursts of vault events into one notification per frame. */
  notify() {
    if (this.notifyHandle !== null) return;
    this.notifyHandle = window.setTimeout(() => {
      this.notifyHandle = null;
      for (const listener of this.listeners) listener();
    }, 50);
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  transactions() {
    return [...this.transactionMap.values()];
  }
  accounts() {
    return [...this.accountMap.values()];
  }
  categories() {
    return [...this.categoryMap.values()];
  }
};

// src/data/create.ts
var import_obsidian3 = require("obsidian");

// src/data/vault-json.ts
var import_obsidian2 = require("obsidian");

// src/domain/exclusion.ts
var RULE_FIELDS = [
  "sms_message",
  "merchant",
  "from_account",
  "to_account",
  "category",
  "transaction_type",
  "amount",
  "timestamp"
];
var RULE_OPS = [
  "contains",
  "not_contains",
  "equals",
  "not_equals",
  "starts_with",
  "ends_with",
  "matches",
  "gt",
  "lt",
  "between"
];
var NUMERIC_OPS = /* @__PURE__ */ new Set(["gt", "lt", "between"]);
function textOf(record, field) {
  switch (field) {
    case "sms_message":
      return record.smsMessage;
    case "merchant":
      return record.merchant;
    case "from_account":
      return record.fromAccount;
    case "to_account":
      return record.toAccount;
    case "category":
      return record.category;
    case "transaction_type":
      return record.type;
    case "timestamp":
      return record.timestamp;
    case "amount":
      return record.amount === null ? "" : String(record.amount);
  }
}
function numberOf(record, field) {
  if (field === "amount") return record.amount;
  const parsed = Number(textOf(record, field));
  return Number.isFinite(parsed) ? parsed : null;
}
function matchesCondition(record, condition) {
  if (NUMERIC_OPS.has(condition.op)) {
    const actual2 = numberOf(record, condition.field);
    if (actual2 === null) return false;
    const first = Number(condition.value);
    if (!Number.isFinite(first)) return false;
    if (condition.op === "gt") return actual2 > first;
    if (condition.op === "lt") return actual2 < first;
    const second = Number(condition.value2);
    if (!Number.isFinite(second)) return false;
    const low = Math.min(first, second);
    const high = Math.max(first, second);
    return actual2 >= low && actual2 <= high;
  }
  const actual = textOf(record, condition.field).toLowerCase();
  const expected = String(condition.value ?? "").trim().toLowerCase();
  switch (condition.op) {
    case "contains":
      return actual.includes(expected);
    case "not_contains":
      return !actual.includes(expected);
    case "equals":
      return actual === expected;
    case "not_equals":
      return actual !== expected;
    case "starts_with":
      return actual.startsWith(expected);
    case "ends_with":
      return actual.endsWith(expected);
    case "matches":
      try {
        return new RegExp(String(condition.value), "iu").test(textOf(record, condition.field));
      } catch {
        return false;
      }
    default:
      return false;
  }
}
function matchesRule(record, rule) {
  if (!rule.enabled) return false;
  if (!rule.conditions.length) return false;
  return rule.match === "any" ? rule.conditions.some((condition) => matchesCondition(record, condition)) : rule.conditions.every((condition) => matchesCondition(record, condition));
}
function firstMatchingRule(record, rules) {
  return rules.find((rule) => matchesRule(record, rule)) ?? null;
}
var CLEARED = {
  excluded: false,
  exclude_reason: "",
  exclude_source: null,
  exclude_rule_id: ""
};
function resolveExclusion(record, rules) {
  if (record.excluded && record.excludeSource === "manual") return null;
  const rule = firstMatchingRule(record, rules);
  if (!rule) {
    if (record.excluded && record.excludeSource === "rule") return CLEARED;
    return null;
  }
  const desired = {
    excluded: true,
    exclude_reason: rule.reason || rule.name,
    exclude_source: "rule",
    exclude_rule_id: rule.id
  };
  const unchanged = record.excluded && record.excludeSource === "rule" && record.excludeRuleId === desired.exclude_rule_id && record.excludeReason === desired.exclude_reason;
  return unchanged ? null : desired;
}
function validateRule(rule) {
  const errors = [];
  const candidate = rule;
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
    if (!RULE_FIELDS.includes(condition?.field)) {
      errors.push(`${where} has an unknown field.`);
      return;
    }
    if (!RULE_OPS.includes(condition?.op)) {
      errors.push(`${where} has an unknown operator.`);
      return;
    }
    if (condition.op === "matches") {
      try {
        new RegExp(String(condition.value), "iu");
      } catch (error) {
        errors.push(`${where} is not a valid regular expression: ${error.message}`);
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

// src/data/vault-json.ts
async function ensureFolder(app, path) {
  const normalized = (0, import_obsidian2.normalizePath)(path);
  if (!normalized || normalized === "/") return;
  let current = "";
  for (const part of normalized.split("/")) {
    current = current ? `${current}/${part}` : part;
    const existing = app.vault.getAbstractFileByPath(current);
    if (!existing) await app.vault.createFolder(current);
    else if (!(existing instanceof import_obsidian2.TFolder)) throw new Error(`${current} exists but is not a folder.`);
  }
}
async function loadVaultJson(app, path, fallback) {
  const file = app.vault.getAbstractFileByPath((0, import_obsidian2.normalizePath)(path));
  if (!(file instanceof import_obsidian2.TFile)) return fallback;
  try {
    return JSON.parse(await app.vault.cachedRead(file));
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${error.message}`);
  }
}
async function loadRules(app) {
  try {
    const data = await loadVaultJson(app, RULES_PATH, { rules: [] });
    const candidates = Array.isArray(data.rules) ? data.rules : [];
    const rules = [];
    const problems = [];
    for (const candidate of candidates) {
      const errors = validateRule(candidate);
      if (errors.length) problems.push(`${candidate?.id ?? "?"}: ${errors.join(" ")}`);
      else rules.push(candidate);
    }
    return { rules, error: problems.length ? problems.join("\n") : null };
  } catch (error) {
    return { rules: [], error: error.message };
  }
}

// src/domain/parser/patterns.ts
function makeRegex(pattern) {
  const translated = pattern.replace(/^\(\?i\)/, "").replace(/\(\?P<([A-Za-z_][A-Za-z0-9_]*)>/g, "(?<$1>");
  return new RegExp(translated, "iu");
}
function extractByPatterns(text, patterns) {
  for (const pattern of patterns ?? []) {
    let regex;
    try {
      regex = makeRegex(pattern);
    } catch (error) {
      throw new Error(`Invalid SMS pattern ${pattern}: ${error.message}`);
    }
    const match = text.match(regex);
    if (match) return match;
  }
  return null;
}
function hasKeyword(text, keywords) {
  const folded = text.toLocaleLowerCase();
  return (keywords ?? []).some((word) => folded.includes(String(word).toLocaleLowerCase()));
}

// src/domain/categorize.ts
function categorize(text, rules) {
  const folded = String(text ?? "").toLocaleLowerCase();
  for (const rule of rules.rules ?? []) {
    const keywords = rule.keywords ?? [];
    if (keywords.some((word) => folded.includes(String(word).toLocaleLowerCase()))) {
      return rule.category || "Uncategorized";
    }
  }
  return "Uncategorized";
}

// src/domain/parser/sms.ts
function normalizeCurrency(value, fallback) {
  if (!value) return fallback || "";
  const clean = String(value).toUpperCase().replaceAll(" ", "").replaceAll(".", "");
  return clean === "\u062C\u0645" || clean === "\u062C\u0640\u0645" ? "EGP" : clean;
}
function stableId(text) {
  let first = 2166136261;
  let second = 2654435769;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619) >>> 0;
    second = Math.imul(second ^ code, 2246822507) >>> 0;
  }
  return first.toString(16).padStart(8, "0") + second.toString(16).padStart(8, "0");
}
function accountCandidates(sms, ending, accounts) {
  const folded = sms.toLocaleLowerCase();
  const found = [];
  for (const account of accounts.accounts ?? []) {
    const name = String(account.name ?? "").trim();
    const endings = (account.card_endings ?? []).map(String);
    const aliases = [name, ...account.aliases ?? []];
    const matchesAlias = aliases.some((alias) => {
      const clean = String(alias).trim().toLocaleLowerCase();
      return clean.length >= 3 && folded.includes(clean);
    });
    if (name && (ending && endings.includes(ending) || matchesAlias) && !found.includes(name)) {
      found.push(name);
    }
  }
  if (!found.length && ending) found.push(`Card \u2022\u2022\u2022\u2022${ending}`);
  return found;
}
function parseSms(sms, timestamp, config, patterns, accounts, categories) {
  const amountMatch = extractByPatterns(sms, patterns.amount_patterns);
  const amountText = amountMatch?.groups?.amount?.replaceAll(",", "");
  const amount = amountText && Number.isFinite(Number(amountText)) ? Number(amountText) : null;
  const currencyText = amountMatch?.groups?.currency1 || amountMatch?.groups?.currency2 || "";
  const currency = normalizeCurrency(
    currencyText,
    amount !== null ? config.default_currency ?? "EGP" : ""
  );
  const endingMatch = extractByPatterns(sms, patterns.card_ending_patterns);
  const ending = endingMatch?.groups?.ending ?? "";
  const candidates = accountCandidates(sms, ending, accounts);
  const merchant = extractByPatterns(sms, patterns.merchant_patterns)?.[1]?.trim() ?? "";
  const isTransfer = hasKeyword(sms, patterns.transfer_keywords);
  const isFee = hasKeyword(sms, patterns.fee_keywords);
  const isCredit = hasKeyword(sms, patterns.credit_keywords);
  const isDebit = hasKeyword(sms, patterns.debit_keywords);
  let transactionType = "";
  if (isTransfer) transactionType = "transfer";
  else if (isFee && !isCredit) transactionType = "fee";
  else if (isCredit && !isDebit) transactionType = "credit";
  else if (isDebit && !isCredit) transactionType = "debit";
  let fromAccount = "";
  let toAccount = "";
  if (transactionType === "debit" || transactionType === "fee") fromAccount = candidates[0] ?? "";
  else if (transactionType === "credit") toAccount = candidates[0] ?? "";
  else if (transactionType === "transfer") {
    fromAccount = candidates[0] ?? "";
    toAccount = candidates[1] ?? "";
  }
  let category = categorize(`${sms}
${merchant}`, categories);
  if (transactionType === "fee") category = "Fees";
  else if (transactionType === "transfer" && category === "Uncategorized") category = "Transfer";
  const checks = [amount !== null, Boolean(currency), Boolean(transactionType), candidates.length > 0];
  if (category !== "Uncategorized") checks.push(true);
  const confidence = Math.round(checks.filter(Boolean).length / checks.length * 100) / 100;
  const complete = amount !== null && Boolean(currency) && Boolean(transactionType) && Boolean(fromAccount || toAccount);
  const fingerprint = `${sms.trim().toLocaleLowerCase().replace(/\s+/g, " ")}|${timestamp}`;
  return {
    amount,
    currency,
    from_account: fromAccount,
    to_account: toAccount,
    category,
    merchant,
    transaction_type: transactionType,
    status: complete ? "parsed" : "needs_review",
    parser_confidence: confidence,
    transaction_id: stableId(fingerprint)
  };
}
function extractTimestamp(sms, patterns) {
  const match = extractByPatterns(sms, patterns.date_patterns);
  const groups = match?.groups;
  if (!groups) return null;
  const year = groups.year ?? "";
  const month = groups.month ?? "";
  const day = groups.day ?? "";
  if (!year || !month || !day) return null;
  const pad = (value, width = 2) => String(value).padStart(width, "0");
  const date = `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
  const time = `${pad(groups.hour ?? "00")}:${pad(groups.minute ?? "00")}:${pad(groups.second ?? "00")}`;
  const candidate = `${date}T${time}+03:00`;
  return Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

// src/data/create.ts
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var KNOWN_PARAMS = /* @__PURE__ */ new Set(["action", "message", "sms", "text", "timestamp", "date"]);
function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}
function protocolValue(params, ...names) {
  for (const name of names) {
    const value = params?.[name];
    if (value !== null && value !== void 0 && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}
function protocolMessage(params) {
  let message = protocolValue(params, "message", "sms", "text");
  if (!message) return "";
  for (const [key, value] of Object.entries(params ?? {})) {
    if (KNOWN_PARAMS.has(key)) continue;
    message += `&${key}`;
    if (value !== null && value !== void 0 && String(value) !== "") message += `=${value}`;
  }
  return message;
}
function transactionPathParts(timestamp) {
  const direct = String(timestamp).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (direct) {
    return `${direct[1]}/${MONTHS[Number(direct[2]) - 1]}/${direct[3]}T${direct[4]}-${direct[5]}-${direct[6]}`;
  }
  const date = new Date(timestamp);
  const usable = Number.isNaN(date.getTime()) ? /* @__PURE__ */ new Date() : date;
  const two = (value) => String(value).padStart(2, "0");
  return [
    usable.getFullYear(),
    MONTHS[usable.getMonth()],
    `${two(usable.getDate())}T${two(usable.getHours())}-${two(usable.getMinutes())}-${two(usable.getSeconds())}`
  ].join("/");
}
function uniqueTransactionPath(app, timestamp) {
  const base = `${TRANSACTIONS_DIR}/${transactionPathParts(timestamp)}`;
  let candidate = `${base}.md`;
  let suffix = 2;
  while (app.vault.getAbstractFileByPath(candidate)) {
    candidate = `${base}-${suffix}.md`;
    suffix += 1;
  }
  return candidate;
}
function transactionMarkdown(fields, sms, note = "") {
  const lines = [
    "---",
    "type: transaction",
    `timestamp: ${yamlString(fields.timestamp)}`,
    `sms_message: ${yamlString(sms)}`,
    fields.amount === null || fields.amount === void 0 ? "amount:" : `amount: ${fields.amount}`,
    fields.currency ? `currency: ${yamlString(fields.currency)}` : "currency:",
    fields.from_account ? `from_account: ${yamlString(fields.from_account)}` : "from_account:",
    fields.to_account ? `to_account: ${yamlString(fields.to_account)}` : "to_account:",
    `category: ${yamlString(fields.category || "Uncategorized")}`,
    fields.merchant ? `merchant: ${yamlString(fields.merchant)}` : "merchant:",
    fields.transaction_type ? `transaction_type: ${yamlString(fields.transaction_type)}` : "transaction_type:",
    `status: ${fields.status || "pending"}`,
    `source: ${fields.source}`,
    fields.parser_confidence === null || fields.parser_confidence === void 0 ? "parser_confidence:" : `parser_confidence: ${fields.parser_confidence}`,
    fields.transaction_id ? `transaction_id: ${yamlString(fields.transaction_id)}` : "transaction_id:",
    "tags:",
    "  - finance/transaction",
    "---",
    "",
    "# Transaction",
    "",
    "## Original SMS",
    "",
    "```text",
    sms,
    "```",
    ""
  ];
  if (note) lines.push("## Notes", "", note, "");
  return lines.join("\n");
}
async function writeVaultFile(app, vaultPath, content) {
  const normalized = (0, import_obsidian3.normalizePath)(vaultPath);
  const slash = normalized.lastIndexOf("/");
  if (slash > 0) await ensureFolder(app, normalized.slice(0, slash));
  const existing = app.vault.getAbstractFileByPath(normalized);
  if (existing instanceof import_obsidian3.TFile) await app.vault.process(existing, () => content);
  else if (existing) throw new Error(`${normalized} exists but is not a file.`);
  else await app.vault.create(normalized, content);
}
async function createFile(app, path, content) {
  await writeVaultFile(app, path, content);
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof import_obsidian3.TFile)) throw new Error(`Could not create ${path}.`);
  return file;
}
function resolveCaptureTimestamp(params, sms, patterns, now = /* @__PURE__ */ new Date()) {
  return protocolValue(params, "timestamp", "date") || extractTimestamp(sms, patterns) || now.toISOString();
}
async function createRawSmsTransaction(app, params, patterns = {}) {
  const sms = protocolMessage(params);
  if (!sms) throw new Error("the message parameter is empty");
  const timestamp = resolveCaptureTimestamp(params, sms, patterns);
  const path = uniqueTransactionPath(app, timestamp);
  const content = transactionMarkdown({
    timestamp,
    amount: null,
    currency: "",
    from_account: "",
    to_account: "",
    category: "Uncategorized",
    merchant: "",
    transaction_type: "",
    status: "pending",
    source: "iphone-shortcut-sms",
    parser_confidence: null,
    transaction_id: ""
  }, sms);
  return createFile(app, path, content);
}
async function createStructuredTransaction(app, params) {
  const amountText = protocolValue(params, "amount").replaceAll(",", "");
  const amount = amountText && Number.isFinite(Number(amountText)) ? Number(amountText) : null;
  const currency = normalizeCurrency(protocolValue(params, "currency"), "");
  const transactionType = protocolValue(params, "type", "transaction_type").toLocaleLowerCase();
  const validType = ["debit", "credit", "transfer", "fee"].includes(transactionType);
  const account = protocolValue(params, "account", "account_name");
  let fromAccount = protocolValue(params, "from", "from_account");
  let toAccount = protocolValue(params, "to", "to_account");
  if (account && !fromAccount && !toAccount) {
    if (transactionType === "credit") toAccount = account;
    else fromAccount = account;
  }
  const timestamp = protocolValue(params, "timestamp", "date") || (/* @__PURE__ */ new Date()).toISOString();
  const sms = protocolValue(params, "message", "sms", "text");
  const category = protocolValue(params, "category") || "Uncategorized";
  const merchant = protocolValue(params, "merchant");
  const checks = [amount !== null, Boolean(currency), validType, Boolean(fromAccount || toAccount)];
  const complete = checks.every(Boolean);
  const fingerprint = [timestamp, amount, currency, transactionType, fromAccount, toAccount, merchant].join("|");
  const path = uniqueTransactionPath(app, timestamp);
  const content = transactionMarkdown({
    timestamp,
    amount,
    currency,
    from_account: fromAccount,
    to_account: toAccount,
    category,
    merchant,
    transaction_type: transactionType,
    status: complete ? "parsed" : "needs_review",
    source: "iphone-shortcut-fields",
    parser_confidence: checks.filter(Boolean).length / checks.length,
    transaction_id: stableId(fingerprint)
  }, sms);
  return createFile(app, path, content);
}

// src/data/write.ts
var import_obsidian4 = require("obsidian");
async function editFrontMatter(app, path, edit) {
  const file = app.vault.getAbstractFileByPath((0, import_obsidian4.normalizePath)(path));
  if (!(file instanceof import_obsidian4.TFile)) throw new Error(`${path} is not a file.`);
  await app.fileManager.processFrontMatter(file, edit);
}
async function updateTransaction(app, path, changes) {
  await editFrontMatter(app, path, (frontmatter) => {
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") delete frontmatter[key];
      else frontmatter[key] = value;
    }
  });
}
async function setExcluded(app, path, excluded, reason, source, ruleId = "") {
  await updateTransaction(app, path, {
    excluded: excluded ? true : null,
    exclude_reason: excluded ? reason : null,
    exclude_source: excluded ? source : null,
    exclude_rule_id: excluded && ruleId ? ruleId : null
  });
}
async function setCategory(app, path, category) {
  await updateTransaction(app, path, { category });
}

// src/settings.ts
var import_obsidian5 = require("obsidian");
var DEFAULT_SETTINGS = {
  runOnStartup: true,
  watchTransactions: true,
  applyExclusionRules: true
};
var FinanceAutomationSettingTab = class extends import_obsidian5.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Finance automation" });
    containerEl.createEl("p", {
      text: "The same local engine runs on desktop and mobile, parsing pending notes and keeping the Budget view up to date."
    });
    new import_obsidian5.Setting(containerEl).setName("Process when Obsidian starts").setDesc("Parse pending notes shortly after opening the vault.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.runOnStartup).onChange(async (value) => {
        this.plugin.settings.runOnStartup = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("Watch transaction notes").setDesc("Run automatically shortly after a transaction note is created or changed.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.watchTransactions).onChange(async (value) => {
        this.plugin.settings.watchTransactions = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("Apply exclusion rules automatically").setDesc("Run the exclusion rules whenever a transaction note is created or changed.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.applyExclusionRules).onChange(async (value) => {
        this.plugin.settings.applyExclusionRules = value;
        await this.plugin.saveSettings();
      })
    );
  }
};

// src/data/types.ts
var DEFAULT_FILTER = {
  period: { unit: "month", anchor: "", from: null, to: null },
  categories: [],
  accounts: [],
  types: [],
  statuses: [],
  search: "",
  amountMin: null,
  amountMax: null,
  excluded: "hide"
};

// src/store/filter-store.ts
var FilterStore = class {
  constructor(saved, today = cairoToday()) {
    this.listeners = /* @__PURE__ */ new Set();
    const { period: _ignored, ...rest } = saved ?? {};
    this.filter = {
      ...DEFAULT_FILTER,
      ...rest,
      period: { unit: "month", anchor: today.slice(0, 7), from: null, to: null }
    };
  }
  get() {
    return this.filter;
  }
  set(patch) {
    this.filter = { ...this.filter, ...patch };
    for (const listener of this.listeners) listener(this.filter);
  }
  setPeriod(period) {
    this.set({ period });
  }
  step(delta) {
    this.set({ period: stepPeriod(this.filter.period, delta) });
  }
  toggle(key, name) {
    const current = this.filter[key];
    const next = current.includes(name) ? current.filter((item) => item !== name) : [...current, name];
    this.set({ [key]: next });
  }
  toggleCategory(name) {
    this.toggle("categories", name);
  }
  toggleAccount(name) {
    this.toggle("accounts", name);
  }
  clearAll() {
    this.set({
      categories: [],
      accounts: [],
      types: [],
      statuses: [],
      search: "",
      amountMin: null,
      amountMax: null,
      excluded: DEFAULT_FILTER.excluded
    });
  }
  activeCount() {
    const filter = this.filter;
    let count = 0;
    if (filter.categories.length) count += 1;
    if (filter.accounts.length) count += 1;
    if (filter.types.length) count += 1;
    if (filter.statuses.length) count += 1;
    if (filter.search.trim()) count += 1;
    if (filter.amountMin !== null || filter.amountMax !== null) count += 1;
    if (filter.excluded !== DEFAULT_FILTER.excluded) count += 1;
    return count;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  serialize() {
    const { period: _period, ...rest } = this.filter;
    return rest;
  }
};

// src/ui/budget-view.ts
var import_obsidian11 = require("obsidian");

// src/ui/components/period-picker.ts
var import_obsidian6 = require("obsidian");
var QUICK_CHIPS = [
  { label: "This month", build: (today) => ({ unit: "month", anchor: today.slice(0, 7), from: null, to: null }) },
  {
    label: "Last month",
    build: (today) => {
      const [year, month] = today.slice(0, 7).split("-").map(Number);
      const previous = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
      return { unit: "month", anchor: previous, from: null, to: null };
    }
  },
  { label: "This year", build: (today) => ({ unit: "year", anchor: today.slice(0, 4), from: null, to: null }) },
  { label: "All", build: () => ({ unit: "all", anchor: "", from: null, to: null }) }
];
var PeriodPicker = class {
  constructor(store) {
    this.store = store;
  }
  render(container) {
    const today = cairoToday();
    const period = this.store.get().period;
    const wrapper = container.createDiv({ cls: "fin-period" });
    const stepper = wrapper.createDiv({ cls: "fin-period-stepper" });
    const back = stepper.createEl("button", { cls: "fin-icon-button", attr: { "aria-label": "Previous period" } });
    (0, import_obsidian6.setIcon)(back, "chevron-left");
    back.addEventListener("click", () => this.store.step(-1));
    const label = stepper.createEl("button", { cls: "fin-period-label", text: periodLabel(period) });
    label.addEventListener("click", (event) => this.openUnitMenu(event, today));
    const forward = stepper.createEl("button", { cls: "fin-icon-button", attr: { "aria-label": "Next period" } });
    (0, import_obsidian6.setIcon)(forward, "chevron-right");
    forward.addEventListener("click", () => this.store.step(1));
    const steppable = period.unit === "month" || period.unit === "year";
    back.toggleClass("is-hidden", !steppable);
    forward.toggleClass("is-hidden", !steppable);
    const chips = wrapper.createDiv({ cls: "fin-chip-row" });
    for (const chip of QUICK_CHIPS) {
      const target = chip.build(today);
      const button = chips.createEl("button", { cls: "fin-chip", text: chip.label });
      const isActive = target.unit === period.unit && target.anchor === period.anchor;
      button.toggleClass("is-active", isActive);
      button.addEventListener("click", () => this.store.setPeriod(target));
    }
  }
  openUnitMenu(event, today) {
    const menu = new import_obsidian6.Menu();
    const current = this.store.get().period;
    const units = [
      { unit: "month", label: "Month" },
      { unit: "year", label: "Year" },
      { unit: "all", label: "All time" }
    ];
    for (const { unit, label } of units) {
      menu.addItem(
        (item) => item.setTitle(label).setChecked(current.unit === unit).onClick(() => {
          const anchor = unit === "month" ? today.slice(0, 7) : unit === "year" ? today.slice(0, 4) : "";
          this.store.setPeriod({ unit, anchor, from: null, to: null });
        })
      );
    }
    menu.addSeparator();
    menu.addItem(
      (item) => item.setTitle("Custom range\u2026").setChecked(current.unit === "custom").onClick(() => {
        this.store.setPeriod({
          unit: "custom",
          anchor: "",
          from: current.from ?? `${today.slice(0, 7)}-01`,
          to: current.to ?? today
        });
      })
    );
    menu.showAtMouseEvent(event);
  }
};

// src/ui/components/filter-bar.ts
var import_obsidian7 = require("obsidian");

// src/domain/filter.ts
function applyFilter(records, filter, today) {
  const range = resolvePeriod(filter.period, today);
  const search = filter.search.trim().toLowerCase();
  const categories = new Set(filter.categories);
  const accounts = new Set(filter.accounts);
  const types = new Set(filter.types);
  const statuses = new Set(filter.statuses);
  const matched = records.filter((record) => {
    if (filter.excluded === "hide" && record.excluded) return false;
    if (filter.excluded === "only" && !record.excluded) return false;
    if (range) {
      if (!record.date) return false;
      if (record.date < range.from || record.date > range.to) return false;
    }
    if (categories.size && !categories.has(record.category)) return false;
    if (accounts.size && !accounts.has(record.fromAccount) && !accounts.has(record.toAccount)) {
      return false;
    }
    if (types.size && !types.has(record.type)) return false;
    if (statuses.size && !statuses.has(record.status)) return false;
    if (search && !record.searchBlob.includes(search)) return false;
    if (filter.amountMin !== null || filter.amountMax !== null) {
      if (record.amount === null) return false;
      const magnitude2 = Math.abs(record.amount);
      if (filter.amountMin !== null && magnitude2 < filter.amountMin) return false;
      if (filter.amountMax !== null && magnitude2 > filter.amountMax) return false;
    }
    return true;
  });
  return matched.sort((a, b) => (b.epoch ?? -Infinity) - (a.epoch ?? -Infinity));
}
function countNeedingReview(records) {
  return records.filter(
    (record) => !record.excluded && (record.status !== "parsed" || record.amount === null)
  ).length;
}
function distinctCategories(records) {
  const names = new Set(records.map((record) => record.category).filter(Boolean));
  return [...names].sort((a, b) => a.localeCompare(b));
}
function distinctAccounts(records) {
  const names = /* @__PURE__ */ new Set();
  for (const record of records) {
    if (record.fromAccount) names.add(record.fromAccount);
    if (record.toAccount) names.add(record.toAccount);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

// src/ui/components/filter-bar.ts
var TYPE_OPTIONS = [
  { value: "debit", label: "Spending" },
  { value: "credit", label: "Income" },
  { value: "transfer", label: "Transfers" },
  { value: "fee", label: "Fees" }
];
var STATUS_OPTIONS = [
  { value: "parsed", label: "Parsed" },
  { value: "needs_review", label: "Needs review" },
  { value: "pending", label: "Pending" }
];
var EXCLUDED_OPTIONS = [
  { value: "hide", label: "Hide excluded" },
  { value: "show", label: "Show excluded" },
  { value: "only", label: "Only excluded" }
];
var FilterBar = class {
  constructor(store, allRecords) {
    this.store = store;
    this.expanded = false;
    this.allRecords = allRecords;
  }
  /**
   * The view keeps one bar alive across redraws so the disclosure does not snap
   * shut every time a filter changes, which means the record set it offers
   * options from has to be refreshed rather than passed once at construction.
   */
  setRecords(allRecords) {
    this.allRecords = allRecords;
  }
  render(container) {
    const filter = this.store.get();
    const bar = container.createDiv({ cls: "fin-filter-bar" });
    const searchRow = bar.createDiv({ cls: "fin-search" });
    const searchIcon = searchRow.createSpan({ cls: "fin-search-icon" });
    (0, import_obsidian7.setIcon)(searchIcon, "search");
    const input = searchRow.createEl("input", {
      cls: "fin-search-input",
      attr: { type: "search", placeholder: "Search merchant, SMS, category", value: filter.search }
    });
    let timer = null;
    input.addEventListener("input", () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        this.store.set({ search: input.value });
      }, 200);
    });
    const chips = bar.createDiv({ cls: "fin-chip-row" });
    this.multiChip(
      chips,
      "Category",
      filter.categories,
      distinctCategories(this.allRecords),
      (next) => this.store.set({ categories: next })
    );
    this.multiChip(
      chips,
      "Account",
      filter.accounts,
      distinctAccounts(this.allRecords),
      (next) => this.store.set({ accounts: next })
    );
    const more = chips.createEl("button", { cls: "fin-chip", text: this.expanded ? "Fewer filters" : "More filters" });
    more.addEventListener("click", () => {
      this.expanded = !this.expanded;
      bar.remove();
      this.render(container);
    });
    if (this.store.activeCount() > 0) {
      const clear = chips.createEl("button", { cls: "fin-chip fin-chip-clear", text: "Clear all" });
      clear.addEventListener("click", () => this.store.clearAll());
    }
    if (!this.expanded) return;
    const extra = bar.createDiv({ cls: "fin-chip-row fin-chip-row-wrap" });
    this.multiChip(
      extra,
      "Type",
      filter.types,
      TYPE_OPTIONS.map((option) => option.value),
      (next) => this.store.set({ types: next }),
      (value) => TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value
    );
    this.multiChip(
      extra,
      "Status",
      filter.statuses,
      STATUS_OPTIONS.map((option) => option.value),
      (next) => this.store.set({ statuses: next }),
      (value) => STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value
    );
    this.singleChip(
      extra,
      EXCLUDED_OPTIONS,
      filter.excluded,
      (value) => this.store.set({ excluded: value })
    );
    const amounts = bar.createDiv({ cls: "fin-amount-range" });
    this.numberInput(amounts, "Min amount", filter.amountMin, (value) => this.store.set({ amountMin: value }));
    this.numberInput(amounts, "Max amount", filter.amountMax, (value) => this.store.set({ amountMax: value }));
    if (filter.period.unit === "custom") {
      const range = bar.createDiv({ cls: "fin-amount-range" });
      this.dateInput(range, "From", filter.period.from, (value) => this.store.setPeriod({ ...filter.period, from: value }));
      this.dateInput(range, "To", filter.period.to, (value) => this.store.setPeriod({ ...filter.period, to: value }));
    }
  }
  multiChip(container, label, selected, options, apply, labelOf = (value) => value) {
    const text = selected.length === 0 ? label : selected.length === 1 ? labelOf(selected[0]) : `${label}: ${selected.length}`;
    const button = container.createEl("button", { cls: "fin-chip", text });
    button.toggleClass("is-active", selected.length > 0);
    button.addEventListener("click", (event) => {
      const menu = new import_obsidian7.Menu();
      if (!options.length) {
        menu.addItem((item) => item.setTitle("Nothing to filter by").setDisabled(true));
      }
      for (const option of options) {
        menu.addItem(
          (item) => item.setTitle(labelOf(option)).setChecked(selected.includes(option)).onClick(() => {
            apply(selected.includes(option) ? selected.filter((item2) => item2 !== option) : [...selected, option]);
          })
        );
      }
      if (selected.length) {
        menu.addSeparator();
        menu.addItem((item) => item.setTitle(`Clear ${label.toLowerCase()}`).onClick(() => apply([])));
      }
      menu.showAtMouseEvent(event);
    });
  }
  singleChip(container, options, selected, apply) {
    const current = options.find((option) => option.value === selected) ?? options[0];
    const button = container.createEl("button", { cls: "fin-chip", text: current.label });
    button.toggleClass("is-active", selected !== options[0].value);
    button.addEventListener("click", (event) => {
      const menu = new import_obsidian7.Menu();
      for (const option of options) {
        menu.addItem(
          (item) => item.setTitle(option.label).setChecked(option.value === selected).onClick(() => apply(option.value))
        );
      }
      menu.showAtMouseEvent(event);
    });
  }
  numberInput(container, placeholder, value, apply) {
    const input = container.createEl("input", {
      cls: "fin-range-input",
      attr: { type: "number", inputmode: "decimal", placeholder, value: value === null ? "" : String(value) }
    });
    input.addEventListener("change", () => {
      const parsed = Number(input.value);
      apply(input.value.trim() === "" || !Number.isFinite(parsed) ? null : parsed);
    });
  }
  dateInput(container, placeholder, value, apply) {
    const input = container.createEl("input", {
      cls: "fin-range-input",
      attr: { type: "date", "aria-label": placeholder, value: value ?? "" }
    });
    input.addEventListener("change", () => apply(input.value));
  }
};

// src/ui/tabs/transactions-tab.ts
var import_obsidian10 = require("obsidian");

// src/domain/aggregate.ts
function emptyTotals() {
  return { income: 0, expenses: 0, transfers: 0, net: 0, count: 0 };
}
function counts(record) {
  return !record.excluded && record.amount !== null;
}
function magnitude(record) {
  return Math.abs(record.amount ?? 0);
}
function isExpense(record) {
  return record.type === "debit" || record.type === "fee";
}
function totalsByCurrency(records) {
  const result = /* @__PURE__ */ new Map();
  for (const record of records) {
    const currency = record.currency || "Unknown";
    const totals = result.get(currency) ?? emptyTotals();
    result.set(currency, totals);
    if (!counts(record)) continue;
    const value = magnitude(record);
    totals.count += 1;
    if (record.type === "credit") totals.income += value;
    else if (isExpense(record)) totals.expenses += value;
    else if (record.type === "transfer") totals.transfers += value;
    totals.net = totals.income - totals.expenses;
  }
  return result;
}
function groupByDay(records) {
  const buckets = /* @__PURE__ */ new Map();
  for (const record of records) {
    const date = record.date ?? "";
    const bucket = buckets.get(date) ?? [];
    bucket.push(record);
    buckets.set(date, bucket);
  }
  return [...buckets].sort((a, b) => b[0].localeCompare(a[0])).map(([date, dayRecords]) => ({ date, records: dayRecords, totals: totalsByCurrency(dayRecords) }));
}

// src/ui/format.ts
var AMOUNT_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
var MONTHS2 = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
function formatAmount(amount) {
  return AMOUNT_FORMAT.format(Math.abs(amount));
}
function formatMoney(amount, currency) {
  return currency ? `${formatAmount(amount)} ${currency}` : formatAmount(amount);
}
function directionOf(record) {
  if (record.type === "credit") return "in";
  if (record.type === "debit" || record.type === "fee") return "out";
  return "neutral";
}
function formatSignedMoney(record) {
  const direction = directionOf(record);
  const sign = direction === "out" ? "\u2212" : direction === "in" ? "+" : "";
  return `${sign}${formatAmount(record.amount ?? 0)}`;
}
function formatDayHeader(date, today) {
  if (!date) return "No date";
  if (date === today) return "Today";
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);
  if (date === yesterday) return "Yesterday";
  const instant = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
  const weekday = WEEKDAYS[instant.getUTCDay()];
  const month = MONTHS2[instant.getUTCMonth()];
  return `${weekday}, ${instant.getUTCDate()} ${month}`;
}
function formatTime(time) {
  return time ?? "";
}

// src/ui/components/summary-strip.ts
var SummaryStrip = class {
  render(container, totals) {
    const wrapper = container.createDiv({ cls: "fin-summary" });
    if (!totals.size) {
      this.renderRow(wrapper, "", { income: 0, expenses: 0, transfers: 0, net: 0, count: 0 });
      return;
    }
    const currencies = [...totals.keys()].sort();
    for (const currency of currencies) {
      this.renderRow(wrapper, currencies.length > 1 ? currency : "", totals.get(currency));
    }
  }
  renderRow(container, currencyLabel, totals) {
    if (currencyLabel) container.createDiv({ cls: "fin-summary-currency", text: currencyLabel });
    const row = container.createDiv({ cls: "fin-summary-row" });
    this.cell(row, "Income", formatAmount(totals.income), "fin-in");
    this.cell(row, "Expenses", formatAmount(totals.expenses), "fin-out");
    this.cell(row, "Net", formatAmount(totals.net), totals.net < 0 ? "fin-out" : "fin-in");
  }
  cell(row, label, value, tone) {
    const cell = row.createDiv({ cls: "fin-summary-cell" });
    cell.createDiv({ cls: "fin-summary-label", text: label });
    cell.createDiv({ cls: `fin-summary-value fin-amount ${tone}`, text: value });
  }
};

// src/ui/components/transaction-row.ts
var import_obsidian8 = require("obsidian");

// src/ui/colors.ts
var CATEGORY_PALETTE = [
  "#3B82F6",
  "#EF4444",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
  "#6366F1",
  "#84CC16",
  "#06B6D4",
  "#A855F7"
];
var DEFAULT_ICONS = {
  Groceries: "shopping-cart",
  Dining: "utensils",
  Transport: "car",
  Bills: "receipt",
  Shopping: "shopping-bag",
  Health: "heart-pulse",
  Income: "trending-up",
  Fees: "percent",
  Transfer: "arrow-left-right",
  Uncategorized: "circle-help"
};
function hashOf(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619) >>> 0;
  }
  return hash;
}
function categoryColor(name, categories) {
  const configured = categories.get(name)?.color;
  if (configured) return configured;
  return CATEGORY_PALETTE[hashOf(name) % CATEGORY_PALETTE.length];
}
function categoryIcon(name, categories) {
  return categories.get(name)?.icon ?? DEFAULT_ICONS[name] ?? "circle-dashed";
}

// src/ui/components/transaction-row.ts
var TransactionRow = class {
  constructor(record, categories, handlers) {
    this.record = record;
    this.categories = categories;
    this.handlers = handlers;
  }
  render(container) {
    const record = this.record;
    const row = container.createDiv({ cls: "fin-row" });
    row.toggleClass("is-excluded", record.excluded);
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    const color = categoryColor(record.category, this.categories);
    const glyph = row.createDiv({ cls: "fin-row-glyph" });
    glyph.style.setProperty("--fin-cat-color", color);
    (0, import_obsidian8.setIcon)(glyph, categoryIcon(record.category, this.categories));
    const text = row.createDiv({ cls: "fin-row-text" });
    const primary = record.merchant || record.category || record.type || "Transaction";
    text.createDiv({ cls: "fin-row-primary", text: primary });
    const secondaryParts = [
      record.fromAccount || record.toAccount,
      formatTime(record.time)
    ].filter(Boolean);
    text.createDiv({ cls: "fin-row-secondary", text: secondaryParts.join(" \xB7 ") });
    if (record.status !== "parsed" || record.amount === null) {
      const badge = text.createSpan({ cls: "fin-badge fin-badge-warn", text: "Needs review" });
      badge.setAttribute("title", "The parser could not read every field");
    }
    if (record.excluded) {
      text.createSpan({
        cls: "fin-badge fin-badge-excluded",
        text: record.excludeReason || "Excluded"
      });
    }
    const amount = row.createDiv({ cls: "fin-row-amount" });
    const direction = directionOf(record);
    const value = amount.createDiv({
      cls: `fin-amount fin-${direction}`,
      text: record.amount === null ? "\u2014" : formatSignedMoney(record)
    });
    value.toggleClass("is-struck", record.excluded);
    amount.createDiv({ cls: "fin-row-currency", text: record.currency });
    row.addEventListener("click", () => this.handlers.onOpen(record));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.handlers.onOpen(record);
      }
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.handlers.onQuickMenu(record, event);
    });
    let pressTimer = null;
    row.addEventListener("touchstart", (event) => {
      pressTimer = window.setTimeout(() => {
        pressTimer = null;
        const touch = event.touches[0];
        this.handlers.onQuickMenu(record, new MouseEvent("contextmenu", {
          clientX: touch.clientX,
          clientY: touch.clientY
        }));
      }, 500);
    }, { passive: true });
    const cancelPress = () => {
      if (pressTimer !== null) window.clearTimeout(pressTimer);
      pressTimer = null;
    };
    row.addEventListener("touchend", cancelPress);
    row.addEventListener("touchmove", cancelPress);
    return row;
  }
};

// src/ui/components/empty-state.ts
var import_obsidian9 = require("obsidian");
function renderEmptyState(container, icon, title, body) {
  const wrapper = container.createDiv({ cls: "fin-empty" });
  const iconEl = wrapper.createDiv({ cls: "fin-empty-icon" });
  (0, import_obsidian9.setIcon)(iconEl, icon);
  wrapper.createEl("h3", { text: title });
  wrapper.createEl("p", { text: body });
}

// src/ui/tabs/transactions-tab.ts
var PAGE_SIZE = 100;
var TransactionsTab = class {
  constructor(plugin) {
    this.plugin = plugin;
    this.shown = PAGE_SIZE;
  }
  /** Reset paging whenever the filter changes, so a new filter starts at the top. */
  resetPaging() {
    this.shown = PAGE_SIZE;
  }
  render(container) {
    const today = cairoToday();
    const all = this.plugin.index.transactions();
    const filtered = applyFilter(all, this.plugin.store.get(), today);
    const categories = new Map(this.plugin.index.categories().map((item) => [item.name, item]));
    new SummaryStrip().render(container, totalsByCurrency(filtered));
    const review = countNeedingReview(filtered);
    if (review > 0) this.renderReviewBanner(container, review);
    if (!filtered.length) {
      renderEmptyState(
        container,
        "receipt",
        all.length ? "Nothing matches these filters" : "No transactions yet",
        all.length ? "Try a different month, or clear the filters." : "Capture one from the iPhone Shortcut, or add one by hand."
      );
      this.renderAddButton(container);
      return;
    }
    const list = container.createDiv({ cls: "fin-list" });
    const visible = filtered.slice(0, this.shown);
    for (const group of groupByDay(visible)) {
      const header = list.createDiv({ cls: "fin-day-header" });
      header.createSpan({ cls: "fin-day-label", text: formatDayHeader(group.date, today) });
      const totals = [...group.totals].map(
        ([currency, dayTotals]) => `${formatAmount(dayTotals.expenses)}${group.totals.size > 1 ? ` ${currency}` : ""}`
      ).join(" \xB7 ");
      header.createSpan({ cls: "fin-day-total fin-amount", text: totals });
      for (const record of group.records) {
        new TransactionRow(record, categories, {
          onOpen: (target) => this.plugin.openTransactionSheet(target),
          onQuickMenu: (target, event) => this.openQuickMenu(target, event)
        }).render(list);
      }
    }
    if (filtered.length > this.shown) {
      const more = list.createEl("button", {
        cls: "fin-more",
        text: `Show ${Math.min(PAGE_SIZE, filtered.length - this.shown)} more of ${filtered.length}`
      });
      more.addEventListener("click", () => {
        this.shown += PAGE_SIZE;
        this.plugin.refreshBudgetView();
      });
    }
    this.renderAddButton(container);
  }
  renderReviewBanner(container, count) {
    const banner = container.createDiv({ cls: "fin-banner" });
    const icon = banner.createSpan({ cls: "fin-banner-icon" });
    (0, import_obsidian10.setIcon)(icon, "alert-triangle");
    banner.createSpan({
      text: `${count} transaction${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} review`
    });
    const action = banner.createEl("button", { cls: "fin-banner-action", text: "Show" });
    action.addEventListener("click", () => {
      this.plugin.store.set({ statuses: ["needs_review", "pending"] });
    });
  }
  renderAddButton(container) {
    const button = container.createEl("button", { cls: "fin-fab", attr: { "aria-label": "Add transaction" } });
    (0, import_obsidian10.setIcon)(button, "plus");
    button.addEventListener("click", () => this.plugin.openAddTransactionModal());
  }
  openQuickMenu(record, event) {
    const menu = new import_obsidian10.Menu();
    menu.addItem(
      (item) => item.setTitle(record.excluded ? "Include in calculations" : "Exclude from calculations").setIcon(record.excluded ? "eye" : "eye-off").onClick(async () => {
        try {
          await setExcluded(
            this.plugin.app,
            record.path,
            !record.excluded,
            record.excluded ? "" : "Excluded by hand",
            "manual"
          );
        } catch (error) {
          new import_obsidian10.Notice(`Could not update the transaction: ${error.message}`);
        }
      })
    );
    menu.addSeparator();
    const names = this.plugin.index.categories().map((item) => item.name).sort();
    for (const name of names.length ? names : ["Uncategorized"]) {
      menu.addItem(
        (item) => item.setTitle(name).setChecked(record.category === name).onClick(async () => {
          try {
            await setCategory(this.plugin.app, record.path, name);
          } catch (error) {
            new import_obsidian10.Notice(`Could not set the category: ${error.message}`);
          }
        })
      );
    }
    menu.addSeparator();
    menu.addItem(
      (item) => item.setTitle("Open note").setIcon("file-text").onClick(() => {
        void this.plugin.app.workspace.openLinkText(record.path, "", true);
      })
    );
    menu.showAtMouseEvent(event);
  }
};

// src/ui/budget-view.ts
var BUDGET_VIEW_TYPE = "finance-budget-view";
var TABS = [
  { id: "transactions", label: "Transactions" },
  { id: "accounts", label: "Accounts" },
  { id: "stats", label: "Stats" }
];
var BudgetView = class extends import_obsidian11.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.activeTab = "transactions";
    this.filterBar = null;
    this.unsubscribe = [];
    this.plugin = plugin;
  }
  getViewType() {
    return BUDGET_VIEW_TYPE;
  }
  getDisplayText() {
    return "Budget";
  }
  getIcon() {
    return "wallet";
  }
  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass("finance-budget");
    this.transactionsTab = new TransactionsTab(this.plugin);
    this.tabBarEl = root.createDiv({ cls: "fin-tabs" });
    this.headerEl = root.createDiv({ cls: "fin-header" });
    this.bodyEl = root.createDiv({ cls: "fin-tab-body" });
    this.renderTabBar();
    this.renderActiveTab();
    this.unsubscribe.push(this.plugin.index.subscribe(() => this.renderActiveTab()));
    this.unsubscribe.push(this.plugin.store.subscribe(() => {
      void this.plugin.persistFilter();
      this.transactionsTab.resetPaging();
      this.renderActiveTab();
    }));
  }
  async onClose() {
    for (const stop of this.unsubscribe) stop();
    this.unsubscribe = [];
    this.filterBar = null;
  }
  renderTabBar() {
    this.tabBarEl.empty();
    for (const tab of TABS) {
      const button = this.tabBarEl.createEl("button", { cls: "fin-tab", text: tab.label });
      button.toggleClass("is-active", tab.id === this.activeTab);
      button.setAttribute("aria-selected", String(tab.id === this.activeTab));
      button.addEventListener("click", () => {
        if (this.activeTab === tab.id) return;
        this.activeTab = tab.id;
        this.renderTabBar();
        this.renderActiveTab();
      });
    }
  }
  renderActiveTab() {
    this.headerEl.empty();
    new PeriodPicker(this.plugin.store).render(this.headerEl);
    const all = this.plugin.index.transactions();
    if (!this.filterBar) this.filterBar = new FilterBar(this.plugin.store, all);
    else this.filterBar.setRecords(all);
    this.filterBar.render(this.headerEl);
    this.bodyEl.empty();
    if (this.activeTab === "transactions") this.renderTransactions();
    else if (this.activeTab === "accounts") this.renderAccounts();
    else this.renderStats();
  }
  // Filled in by Task 6 (transactions) and Plan C (accounts, stats).
  renderTransactions() {
    this.transactionsTab.render(this.bodyEl);
  }
  renderAccounts() {
    this.bodyEl.createEl("p", { text: "Accounts" });
  }
  renderStats() {
    this.bodyEl.createEl("p", { text: "Stats" });
  }
};

// src/ui/components/transaction-sheet.ts
var import_obsidian12 = require("obsidian");
var TYPE_CHOICES = {
  debit: "Spending",
  credit: "Income",
  transfer: "Transfer",
  fee: "Fee"
};
var TransactionSheet = class extends import_obsidian12.Modal {
  constructor(app, plugin, record) {
    super(app);
    this.plugin = plugin;
    this.record = record;
    this.draft = {
      amount: record.amount === null ? "" : String(record.amount),
      currency: record.currency,
      date: record.date ?? "",
      time: record.time ?? "",
      fromAccount: record.fromAccount,
      toAccount: record.toAccount,
      category: record.category,
      merchant: record.merchant,
      type: record.type,
      excluded: record.excluded,
      excludeReason: record.excludeReason
    };
  }
  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("fin-sheet");
    contentEl.empty();
    contentEl.createEl("h2", {
      text: this.record.merchant || this.record.category || "Transaction"
    });
    const accounts = this.plugin.index.accounts().map((account) => account.name).sort();
    const categories = this.plugin.index.categories().map((category) => category.name).sort();
    new import_obsidian12.Setting(contentEl).setName("Amount").addText(
      (text) => text.setValue(this.draft.amount).onChange((value) => {
        this.draft.amount = value;
      })
    ).addText(
      (text) => text.setPlaceholder("EGP").setValue(this.draft.currency).onChange((value) => {
        this.draft.currency = value;
      })
    );
    new import_obsidian12.Setting(contentEl).setName("Date").addText((text) => {
      text.inputEl.type = "date";
      text.setValue(this.draft.date).onChange((value) => {
        this.draft.date = value;
      });
    }).addText((text) => {
      text.inputEl.type = "time";
      text.setValue(this.draft.time).onChange((value) => {
        this.draft.time = value;
      });
    });
    new import_obsidian12.Setting(contentEl).setName("Type").addDropdown((dropdown) => {
      dropdown.addOption("", "Unknown");
      for (const [value, label] of Object.entries(TYPE_CHOICES)) dropdown.addOption(value, label);
      dropdown.setValue(this.draft.type).onChange((value) => {
        this.draft.type = value;
      });
    });
    new import_obsidian12.Setting(contentEl).setName("Category").addDropdown((dropdown) => {
      const options = categories.length ? categories : ["Uncategorized"];
      if (!options.includes(this.draft.category)) options.unshift(this.draft.category);
      for (const name of options) dropdown.addOption(name, name);
      dropdown.setValue(this.draft.category).onChange((value) => {
        this.draft.category = value;
      });
    });
    this.accountSetting(contentEl, "From account", accounts, "fromAccount");
    this.accountSetting(contentEl, "To account", accounts, "toAccount");
    new import_obsidian12.Setting(contentEl).setName("Merchant").addText(
      (text) => text.setValue(this.draft.merchant).onChange((value) => {
        this.draft.merchant = value;
      })
    );
    new import_obsidian12.Setting(contentEl).setName("Exclude from calculations").setDesc("The transaction stays in the list but counts towards nothing.").addToggle(
      (toggle) => toggle.setValue(this.draft.excluded).onChange((value) => {
        this.draft.excluded = value;
        reasonSetting.settingEl.toggleClass("is-hidden", !value);
      })
    );
    const reasonSetting = new import_obsidian12.Setting(contentEl).setName("Reason").addText(
      (text) => text.setPlaceholder("Did not happen").setValue(this.draft.excludeReason).onChange((value) => {
        this.draft.excludeReason = value;
      })
    );
    reasonSetting.settingEl.toggleClass("is-hidden", !this.draft.excluded);
    if (this.record.excludeSource === "rule") {
      contentEl.createEl("p", {
        cls: "fin-sheet-note",
        text: `Excluded by the rule "${this.record.excludeRuleId}". Changing it here makes the decision manual, and rules will stop touching it.`
      });
    }
    if (this.record.smsMessage) {
      const details = contentEl.createEl("details", { cls: "fin-sheet-sms" });
      details.createEl("summary", { text: "Original SMS" });
      details.createEl("pre", { text: this.record.smsMessage });
    }
    const meta = contentEl.createDiv({ cls: "fin-sheet-meta" });
    meta.createSpan({ text: `Status: ${this.record.status}` });
    if (this.record.amount !== null) {
      meta.createSpan({ text: formatMoney(this.record.amount, this.record.currency) });
    }
    const actions = contentEl.createDiv({ cls: "fin-sheet-actions" });
    const open = actions.createEl("button", { text: "Open note" });
    open.addEventListener("click", () => {
      this.close();
      void this.app.workspace.openLinkText(this.record.path, "", false);
    });
    const save = actions.createEl("button", { cls: "mod-cta", text: "Save" });
    save.addEventListener("click", () => void this.save());
  }
  accountSetting(container, label, accounts, field) {
    new import_obsidian12.Setting(container).setName(label).addDropdown((dropdown) => {
      dropdown.addOption("", "\u2014");
      const options = [...accounts];
      const current = this.draft[field];
      if (current && !options.includes(current)) options.unshift(current);
      for (const name of options) dropdown.addOption(name, name);
      dropdown.setValue(current).onChange((value) => {
        this.draft[field] = value;
      });
    });
  }
  async save() {
    const amount = this.draft.amount.trim() === "" ? null : Number(this.draft.amount.replaceAll(",", ""));
    if (amount !== null && !Number.isFinite(amount)) {
      new import_obsidian12.Notice("That amount is not a number.");
      return;
    }
    const time = this.draft.time || "00:00";
    const timestamp = this.draft.date ? `${this.draft.date}T${time}:00` : this.record.timestamp;
    try {
      await updateTransaction(this.app, this.record.path, {
        amount,
        currency: this.draft.currency.trim().toUpperCase(),
        timestamp,
        from_account: this.draft.fromAccount,
        to_account: this.draft.toAccount,
        category: this.draft.category,
        merchant: this.draft.merchant,
        transaction_type: this.draft.type,
        excluded: this.draft.excluded ? true : null,
        exclude_reason: this.draft.excluded ? this.draft.excludeReason || "Excluded by hand" : null,
        // Editing by hand always makes the decision manual, so no rule will undo it.
        exclude_source: this.draft.excluded ? "manual" : null,
        exclude_rule_id: null
      });
      this.close();
    } catch (error) {
      new import_obsidian12.Notice(`Could not save: ${error.message}`);
    }
  }
};

// src/main.ts
var SMS_PATTERNS_PATH = `${SETTINGS_DIR}/sms_patterns.json`;
var PARSER_OWNED = /* @__PURE__ */ new Set(["status", "parser_confidence", "transaction_id"]);
var FinanceAutomationPlugin = class extends import_obsidian13.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this.running = false;
    this.queued = false;
    this.watchTimer = null;
    this.startupTimer = null;
    this.status = null;
    this.processIcon = null;
    /** Stops a frontmatter write of ours from re-triggering its own watcher. */
    this.ignoreWatchUntil = /* @__PURE__ */ new Map();
  }
  async onload() {
    const data = await this.loadData() ?? {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    this.index = new TransactionIndex(this.app);
    this.store = new FilterStore(data.filter ?? null);
    this.status = this.addStatusBarItem();
    this.setStatus("ready");
    this.registerView(BUDGET_VIEW_TYPE, (leaf) => new BudgetView(leaf, this));
    this.addRibbonIcon("wallet", "Open Budget", () => void this.activateBudgetView());
    this.addCommand({
      id: "open-budget-view",
      name: "Open Budget",
      callback: () => void this.activateBudgetView()
    });
    this.registerObsidianProtocolHandler("finance-sms", async (params) => {
      await this.handleCaptureLink("sms", params);
    });
    this.registerObsidianProtocolHandler("finance-transaction", async (params) => {
      await this.handleCaptureLink("transaction", params);
    });
    this.processIcon = this.addRibbonIcon("refresh-cw", "Process pending SMS transactions", () => {
      void this.runFinance(true);
    });
    this.processIcon.addClass("finance-automation-process-icon");
    this.addCommand({
      id: "process-transactions",
      name: "Process pending SMS transactions",
      callback: () => void this.runFinance(true)
    });
    this.addCommand({
      id: "apply-exclusion-rules",
      name: "Apply exclusion rules to all transactions",
      callback: async () => {
        const updated = await this.applyRulesToAll();
        new import_obsidian13.Notice(`Finance: updated ${updated} transaction(s).`);
      }
    });
    this.addSettingTab(new FinanceAutomationSettingTab(this.app, this));
    this.register(() => {
      if (this.watchTimer) window.clearTimeout(this.watchTimer);
      if (this.startupTimer) window.clearTimeout(this.startupTimer);
    });
    this.app.workspace.onLayoutReady(() => {
      this.index.build();
      this.index.registerEvents(this);
      const queueIfTransaction = (file) => {
        const ignoredUntil = file ? this.ignoreWatchUntil.get(file.path) ?? 0 : 0;
        if (ignoredUntil && Date.now() >= ignoredUntil) this.ignoreWatchUntil.delete(file.path);
        if (this.settings.watchTransactions && file && isTransactionPath(file.path) && Date.now() >= ignoredUntil) {
          this.queueAutomaticRun();
        }
      };
      this.registerEvent(this.app.vault.on("create", queueIfTransaction));
      this.registerEvent(this.app.vault.on("modify", queueIfTransaction));
      if (this.settings.runOnStartup) {
        this.startupTimer = window.setTimeout(() => void this.runFinance(false), 1500);
      }
    });
  }
  onunload() {
    if (this.watchTimer) window.clearTimeout(this.watchTimer);
    if (this.startupTimer) window.clearTimeout(this.startupTimer);
  }
  async saveSettings() {
    const data = await this.loadData() ?? {};
    await this.saveData({ ...data, ...this.settings });
  }
  async activateBudgetView() {
    const existing = this.app.workspace.getLeavesOfType(BUDGET_VIEW_TYPE);
    if (existing.length) {
      await this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: BUDGET_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
  refreshBudgetView() {
    for (const leaf of this.app.workspace.getLeavesOfType(BUDGET_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof BudgetView) view.renderActiveTab();
    }
  }
  openTransactionSheet(record) {
    new TransactionSheet(this.app, this, record).open();
  }
  openAddTransactionModal() {
    new import_obsidian13.Notice("Coming soon");
  }
  async persistFilter() {
    const data = await this.loadData() ?? {};
    await this.saveData({ ...data, filter: this.store.serialize() });
  }
  async handleCaptureLink(kind, params) {
    try {
      const file = kind === "sms" ? await createRawSmsTransaction(this.app, params, await this.loadPatterns()) : await createStructuredTransaction(this.app, params);
      new import_obsidian13.Notice(`Finance: captured ${file.path}.`, 5e3);
    } catch (error) {
      console.error("Finance capture link failed", error);
      new import_obsidian13.Notice(`Finance capture failed: ${error.message}`, 1e4);
    }
  }
  async loadPatterns() {
    return loadVaultJson(this.app, SMS_PATTERNS_PATH, {});
  }
  queueAutomaticRun() {
    if (this.running) {
      this.queued = true;
      return;
    }
    if (this.watchTimer) window.clearTimeout(this.watchTimer);
    this.watchTimer = window.setTimeout(() => {
      this.watchTimer = null;
      void this.runFinance(false);
    }, 750);
  }
  setStatus(value) {
    this.status?.setText(`Finance: ${value}`);
    if (this.processIcon) {
      this.processIcon.toggleClass("is-processing", value === "running\u2026");
      this.processIcon.setAttribute("aria-busy", value === "running\u2026" ? "true" : "false");
    }
  }
  async runFinance(showNotice) {
    if (this.running) {
      this.queued = true;
      if (showNotice) new import_obsidian13.Notice("Finance processing is already running; another pass is queued.");
      return;
    }
    this.running = true;
    this.setStatus("running\u2026");
    if (showNotice) new import_obsidian13.Notice("Finance: processing\u2026");
    try {
      const updated = await this.processPending();
      this.setStatus("ready");
      if (showNotice) new import_obsidian13.Notice(`Finance: updated ${updated} transaction(s).`, 6e3);
    } catch (error) {
      this.setStatus("error");
      console.error("Finance automation failed", error);
      new import_obsidian13.Notice(`Finance automation failed: ${error.message}`, 1e4);
    } finally {
      this.running = false;
      if (this.queued) {
        this.queued = false;
        window.setTimeout(() => void this.runFinance(false), 500);
      }
    }
  }
  async processPending() {
    const [config, patterns, accounts, categories] = await Promise.all([
      loadVaultJson(this.app, CONFIG_PATH, { default_currency: "EGP" }),
      this.loadPatterns(),
      loadVaultJson(this.app, ACCOUNTS_JSON_PATH, { accounts: [] }),
      loadVaultJson(this.app, CATEGORY_RULES_PATH, { rules: [] })
    ]);
    const { rules } = await loadRules(this.app);
    let updated = 0;
    for (const record of this.index.transactions()) {
      const changes = {};
      const needsParsing = record.status !== "parsed" && Boolean(record.smsMessage);
      if (needsParsing) {
        const parsed = parseSms(record.smsMessage, record.timestamp, config, patterns, accounts, categories);
        for (const [key, value] of Object.entries(parsed)) {
          const recordKey = toRecordKey(key);
          if (!recordKey) continue;
          const current = record[recordKey];
          const isDefault = key === "category" && current === "Uncategorized";
          if (PARSER_OWNED.has(key) || isDefault || current === null || current === "") {
            changes[key] = value;
          }
        }
      }
      if (this.settings.applyExclusionRules) {
        const exclusion = resolveExclusion(record, rules);
        if (exclusion) Object.assign(changes, exclusion);
      }
      if (!Object.keys(changes).length) continue;
      this.ignoreWatchUntil.set(record.path, Date.now() + 2e3);
      await updateTransaction(this.app, record.path, changes);
      updated += 1;
    }
    return updated;
  }
  async applyRulesToAll() {
    const { rules } = await loadRules(this.app);
    let updated = 0;
    for (const record of this.index.transactions()) {
      const exclusion = resolveExclusion(record, rules);
      if (!exclusion) continue;
      this.ignoreWatchUntil.set(record.path, Date.now() + 2e3);
      await updateTransaction(this.app, record.path, { ...exclusion });
      updated += 1;
    }
    return updated;
  }
};
