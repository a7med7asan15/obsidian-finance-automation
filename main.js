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
var import_obsidian6 = require("obsidian");

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

// src/main.ts
var SMS_PATTERNS_PATH = `${SETTINGS_DIR}/sms_patterns.json`;
var PARSER_OWNED = /* @__PURE__ */ new Set(["status", "parser_confidence", "transaction_id"]);
var FinanceAutomationPlugin = class extends import_obsidian6.Plugin {
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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.index = new TransactionIndex(this.app);
    this.status = this.addStatusBarItem();
    this.setStatus("ready");
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
        new import_obsidian6.Notice(`Finance: updated ${updated} transaction(s).`);
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
    await this.saveData(this.settings);
  }
  async handleCaptureLink(kind, params) {
    try {
      const file = kind === "sms" ? await createRawSmsTransaction(this.app, params, await this.loadPatterns()) : await createStructuredTransaction(this.app, params);
      new import_obsidian6.Notice(`Finance: captured ${file.path}.`, 5e3);
    } catch (error) {
      console.error("Finance capture link failed", error);
      new import_obsidian6.Notice(`Finance capture failed: ${error.message}`, 1e4);
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
      if (showNotice) new import_obsidian6.Notice("Finance processing is already running; another pass is queued.");
      return;
    }
    this.running = true;
    this.setStatus("running\u2026");
    if (showNotice) new import_obsidian6.Notice("Finance: processing\u2026");
    try {
      const updated = await this.processPending();
      this.setStatus("ready");
      if (showNotice) new import_obsidian6.Notice(`Finance: updated ${updated} transaction(s).`, 6e3);
    } catch (error) {
      this.setStatus("error");
      console.error("Finance automation failed", error);
      new import_obsidian6.Notice(`Finance automation failed: ${error.message}`, 1e4);
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
