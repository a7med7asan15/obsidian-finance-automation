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
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
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
var import_obsidian25 = require("obsidian");

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
var INBOX_DIR = `${VAULT_ROOT}Inbox`;

// src/codeblock.ts
var import_obsidian = require("obsidian");

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
function cairoNow(now = /* @__PURE__ */ new Date()) {
  const { date, time } = formatInCairo(now);
  return `${date}T${time}:00`;
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
function daysBetween(from, to) {
  const days = [];
  let cursor = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  while (cursor <= end) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 864e5;
  }
  return days;
}

// src/domain/filter.ts
function applyFilter(records, filter, today) {
  const range = resolvePeriod(filter.period, today);
  const search = filter.search.trim().replace(/\s+/gu, " ").toLowerCase();
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

// src/domain/counterparty.ts
var COUNTERPARTY_ROLES = ["merchant", "recipient", "sender"];
var ROLE_LABELS = {
  merchant: "Merchant",
  recipient: "Recipient",
  sender: "Sender",
  "": "Other party"
};
function roleForType(type) {
  if (type === "credit") return "sender";
  if (type === "transfer") return "recipient";
  return "merchant";
}
function counterpartyFields(name, role) {
  const fields = { merchant: "", recipient: "", sender: "" };
  fields[role || "merchant"] = String(name ?? "").trim();
  return fields;
}
function cleanCounterpartyName(raw) {
  return String(raw ?? "").replace(/\s+/gu, " ").replace(/^[\s\-–—*#:.,;]+/u, "").replace(/[\s\-–—*#:.,;]+$/u, "").trim();
}
function readCounterparty(values) {
  for (const role of COUNTERPARTY_ROLES) {
    const name = cleanCounterpartyName(values[role] ?? "");
    if (name) return { counterparty: name, counterpartyRole: role };
  }
  return { counterparty: "", counterpartyRole: "" };
}
function counterpartyKey(name) {
  return cleanCounterpartyName(name).toLocaleLowerCase();
}

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
function sumBy(records, currency, keyOf, labelOf) {
  const buckets = /* @__PURE__ */ new Map();
  for (const record of records) {
    if (!counts(record) || record.currency !== currency || !isExpense(record)) continue;
    const key2 = keyOf(record);
    if (!key2) continue;
    const bucket = buckets.get(key2) ?? { label: labelOf(record), amount: 0, count: 0 };
    bucket.amount += magnitude(record);
    bucket.count += 1;
    buckets.set(key2, bucket);
  }
  return [...buckets].map(([key2, bucket]) => ({ key: key2, ...bucket })).sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}
function spendByCategory(records, currency) {
  return sumBy(records, currency, (record) => record.category, (record) => record.category).map(({ label, amount, count }) => ({ category: label, amount, count }));
}
function spendByMerchant(records, currency, limit) {
  return sumBy(
    records,
    currency,
    (record) => record.counterparty ? record.counterparty.toLowerCase() : null,
    (record) => record.counterparty
  ).slice(0, limit).map(({ label, amount, count }) => ({ merchant: label, amount, count }));
}
function spendByDay(records, currency, from, to) {
  const byDate = /* @__PURE__ */ new Map();
  for (const record of records) {
    if (!counts(record) || record.currency !== currency || !isExpense(record) || !record.date) continue;
    byDate.set(record.date, (byDate.get(record.date) ?? 0) + magnitude(record));
  }
  return daysBetween(from, to).map((date) => ({ date, amount: byDate.get(date) ?? 0 }));
}
function spendByMonth(records, currency, fromMonth, toMonth) {
  const byMonth = /* @__PURE__ */ new Map();
  for (const record of records) {
    if (!counts(record) || record.currency !== currency || !isExpense(record) || !record.month) continue;
    byMonth.set(record.month, (byMonth.get(record.month) ?? 0) + magnitude(record));
  }
  const months = [];
  let cursor = fromMonth;
  while (cursor <= toMonth) {
    months.push({ month: cursor, amount: byMonth.get(cursor) ?? 0 });
    cursor = addMonths(cursor, 1);
  }
  return months;
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
function primaryCurrency(records) {
  const counted = /* @__PURE__ */ new Map();
  for (const record of records) {
    if (!record.currency) continue;
    counted.set(record.currency, (counted.get(record.currency) ?? 0) + 1);
  }
  const ranked = [...counted].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked[0]?.[0] ?? "EGP";
}
function counterpartySummary(records) {
  const buckets = /* @__PURE__ */ new Map();
  for (const record of records) {
    const name = cleanCounterpartyName(record.counterparty);
    if (!name) continue;
    const key2 = counterpartyKey(name);
    let bucket = buckets.get(key2);
    if (!bucket) {
      bucket = {
        key: key2,
        name,
        roles: [],
        count: 0,
        spent: 0,
        received: 0,
        currency: "",
        categories: [],
        category: "",
        lastDate: null,
        paths: [],
        currencies: /* @__PURE__ */ new Map()
      };
      buckets.set(key2, bucket);
    }
    if (name.length > bucket.name.length) bucket.name = name;
    if (record.counterpartyRole && !bucket.roles.includes(record.counterpartyRole)) {
      bucket.roles.push(record.counterpartyRole);
    }
    bucket.count += 1;
    const value = Math.abs(record.amount ?? 0);
    if (record.type === "credit") bucket.received += value;
    else bucket.spent += value;
    if (record.currency) {
      bucket.currencies.set(record.currency, (bucket.currencies.get(record.currency) ?? 0) + 1);
    }
    if (record.category && !bucket.categories.includes(record.category)) {
      bucket.categories.push(record.category);
    }
    if (record.date && (!bucket.lastDate || record.date > bucket.lastDate)) {
      bucket.lastDate = record.date;
    }
    bucket.paths.push(record.path);
  }
  const totals = [];
  for (const bucket of buckets.values()) {
    const ranked = [...bucket.currencies].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    totals.push({
      key: bucket.key,
      name: bucket.name,
      roles: bucket.roles,
      count: bucket.count,
      spent: bucket.spent,
      received: bucket.received,
      currency: ranked[0]?.[0] ?? "",
      categories: [...bucket.categories].sort((a, b) => a.localeCompare(b)),
      category: bucket.categories.length === 1 ? bucket.categories[0] : "",
      lastDate: bucket.lastDate,
      paths: bucket.paths
    });
  }
  return totals.sort(
    (a, b) => b.spent + b.received - (a.spent + a.received) || a.name.localeCompare(b.name)
  );
}
function categorySummary(records) {
  const buckets = /* @__PURE__ */ new Map();
  for (const record of records) {
    const name = record.category || "Uncategorized";
    let bucket = buckets.get(name);
    if (!bucket) {
      bucket = {
        name,
        count: 0,
        spent: 0,
        received: 0,
        currency: "",
        lastDate: null,
        currencies: /* @__PURE__ */ new Map()
      };
      buckets.set(name, bucket);
    }
    bucket.count += 1;
    const value = magnitude(record);
    if (record.type === "credit") bucket.received += value;
    else bucket.spent += value;
    if (record.currency) {
      bucket.currencies.set(record.currency, (bucket.currencies.get(record.currency) ?? 0) + 1);
    }
    if (record.date && (!bucket.lastDate || record.date > bucket.lastDate)) {
      bucket.lastDate = record.date;
    }
  }
  const totals = [];
  for (const bucket of buckets.values()) {
    const ranked = [...bucket.currencies].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    totals.push({
      name: bucket.name,
      count: bucket.count,
      spent: bucket.spent,
      received: bucket.received,
      currency: ranked[0]?.[0] ?? "",
      lastDate: bucket.lastDate
    });
  }
  return totals.sort(
    (a, b) => b.spent + b.received - (a.spent + a.received) || a.name.localeCompare(b.name)
  );
}

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

// src/ui/format.ts
var AMOUNT_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
var MONTHS = [
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
function formatSignedAmount(amount) {
  return `${amount < 0 ? "\u2212" : ""}${formatAmount(amount)}`;
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
  const month = MONTHS[instant.getUTCMonth()];
  return `${weekday}, ${instant.getUTCDate()} ${month}`;
}
function formatTime(time) {
  return time ?? "";
}

// src/ui/charts/hbars.ts
function renderHBars(container, data, options) {
  if (!data.length) {
    container.createEl("p", { cls: "fin-panel-empty", text: "Nothing to show for this period." });
    return;
  }
  const max = Math.max(...data.map((item) => Math.abs(item.value))) || 1;
  const list = container.createDiv({ cls: "fin-hbars" });
  for (const item of data) {
    const row = list.createDiv({ cls: "fin-hbar-row" });
    const head = row.createDiv({ cls: "fin-hbar-head" });
    head.createSpan({ cls: "fin-hbar-label", text: item.label });
    head.createSpan({
      cls: "fin-hbar-value fin-amount",
      text: `${formatSignedAmount(item.value)}${options.currency ? ` ${options.currency}` : ""}`
    });
    const track = row.createDiv({ cls: "fin-hbar-track" });
    const fill = track.createDiv({ cls: "fin-hbar-fill" });
    const ratio = item.ratio ?? Math.abs(item.value) / max;
    fill.style.width = `${Math.min(Math.max(ratio, 0), 1) * 100}%`;
    if (item.color) fill.style.background = item.color;
    if (item.ratio !== void 0 && item.ratio > 1) {
      track.addClass("is-over");
    }
    if (item.caption) row.createDiv({ cls: "fin-hbar-caption", text: item.caption });
    if (options.onSelect) {
      row.addClass("is-clickable");
      row.addEventListener("click", () => options.onSelect(item.label));
    }
  }
}

// src/codeblock.ts
function parsePeriod(value, today) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "all") return { unit: "all", anchor: "", from: null, to: null };
  if (/^\d{4}$/.test(text)) return { unit: "year", anchor: text, from: null, to: null };
  if (/^\d{4}-\d{2}$/.test(text)) return { unit: "month", anchor: text, from: null, to: null };
  return { unit: "month", anchor: today.slice(0, 7), from: null, to: null };
}
function splitList(value) {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}
function registerFinanceCodeBlock(plugin) {
  plugin.registerMarkdownCodeBlockProcessor(
    "finance-summary",
    (source, element, _context) => {
      element.empty();
      element.addClass("finance-budget", "fin-embed");
      let options = {};
      if (source.trim()) {
        try {
          options = (0, import_obsidian.parseYaml)(source) ?? {};
        } catch (error) {
          element.createEl("p", { cls: "fin-embed-error", text: `finance-summary: ${error.message}` });
          return;
        }
      }
      const today = cairoToday();
      const filter = {
        ...DEFAULT_FILTER,
        period: parsePeriod(options.period, today),
        categories: splitList(options.categories),
        accounts: splitList(options.accounts)
      };
      const records = applyFilter(plugin.index.transactions(), filter, today);
      if (!records.length) {
        element.createEl("p", { cls: "fin-panel-empty", text: "No transactions for this period." });
        return;
      }
      const currency = primaryCurrency(records);
      const totals = totalsByCurrency(records).get(currency);
      if (totals) {
        const strip = element.createDiv({ cls: "fin-summary-row" });
        for (const [label, value, tone] of [
          ["Income", totals.income, "fin-in"],
          ["Expenses", totals.expenses, "fin-out"],
          ["Net", totals.net, totals.net < 0 ? "fin-out" : "fin-in"]
        ]) {
          const cell2 = strip.createDiv({ cls: "fin-summary-cell" });
          cell2.createDiv({ cls: "fin-summary-label", text: label });
          cell2.createDiv({ cls: `fin-summary-value fin-amount ${tone}`, text: formatAmount(value) });
        }
      }
      const categories = new Map(plugin.index.categories().map((item) => [item.name, item]));
      renderHBars(
        element,
        spendByCategory(records, currency).slice(0, options.limit ?? 5).map((item) => ({
          label: item.category,
          value: item.amount,
          color: categoryColor(item.category, categories)
        })),
        { currency }
      );
      const open = element.createEl("button", { cls: "fin-more", text: "Open Budget" });
      open.addEventListener("click", () => void plugin.activateBudgetView());
    }
  );
}

// src/data/index-store.ts
var import_obsidian2 = require("obsidian");

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
function foldForMatch(text) {
  return String(text ?? "").toLocaleLowerCase().replace(/[ً-ْـ]/gu, "").replace(/[أإآٱ]/gu, "\u0627").replace(/[ىی]/gu, "\u064A").replace(/ة/gu, "\u0647").replace(/\s+/gu, " ").trim();
}
function hasKeyword(text, keywords) {
  const folded = foldForMatch(text);
  return (keywords ?? []).some((word) => {
    const needle = foldForMatch(word);
    return Boolean(needle) && folded.includes(needle);
  });
}

// src/domain/names.ts
var ILLEGAL_IN_NAME = /[\\/:*?"<>|#^[\]]/;
function sameName(left, right) {
  return String(left ?? "").trim().toLocaleLowerCase() === String(right ?? "").trim().toLocaleLowerCase();
}
function noteNameProblem(name, existing, current = "", noun = "category") {
  const article = /^[aeiou]/i.test(noun) ? "an" : "a";
  const wanted = String(name ?? "").trim();
  if (!wanted) return `${article === "an" ? "An" : "A"} ${noun} needs a name.`;
  if (wanted.startsWith(".")) return "A name cannot start with a dot.";
  const illegal = ILLEGAL_IN_NAME.exec(wanted);
  if (illegal) return `A name cannot contain ${illegal[0]}`;
  const clash = (existing ?? []).some(
    (other) => sameName(other, wanted) && !sameName(other, current)
  );
  if (clash) return `There is already ${article} ${noun} called ${wanted}.`;
  return null;
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
function withKeyword(rules, category, keyword) {
  const name = String(category ?? "").trim();
  const word = String(keyword ?? "").trim();
  if (!name || !word) return { rules: [...rules.rules ?? []] };
  const folded = word.toLocaleLowerCase();
  const next = (rules.rules ?? []).map((rule) => ({
    category: rule.category,
    keywords: (rule.keywords ?? []).filter(
      (existing) => String(existing).trim().toLocaleLowerCase() !== folded
    )
  }));
  const target = next.find((rule) => sameName(rule.category, name));
  if (target) target.keywords.push(word);
  else next.push({ category: name, keywords: [word] });
  return { rules: next };
}
function withKeywords(rules, category, keywords) {
  const name = String(category ?? "").trim();
  if (!name) return { rules: [...rules.rules ?? []] };
  const kept = [];
  const seen = /* @__PURE__ */ new Set();
  for (const raw of keywords ?? []) {
    const word = String(raw ?? "").trim();
    const folded = word.toLocaleLowerCase();
    if (!word || seen.has(folded)) continue;
    seen.add(folded);
    kept.push(word);
  }
  const next = (rules.rules ?? []).map((rule) => ({
    category: rule.category,
    keywords: sameName(rule.category, name) ? kept : (rule.keywords ?? []).filter(
      (existing) => !seen.has(String(existing).trim().toLocaleLowerCase())
    )
  }));
  if (!next.some((rule) => sameName(rule.category, name))) {
    next.push({ category: name, keywords: kept });
  }
  return { rules: next };
}
function renamedCategory(rules, from, into) {
  const before = String(from ?? "").trim();
  const after = String(into ?? "").trim();
  if (!before || !after || sameName(before, after)) return { rules: [...rules.rules ?? []] };
  const next = [];
  for (const rule of rules.rules ?? []) {
    const isMoving = sameName(rule.category, before);
    const target = next.find((entry) => sameName(entry.category, after));
    if (isMoving || sameName(rule.category, after)) {
      if (target) target.keywords.push(...rule.keywords ?? []);
      else next.push({ category: after, keywords: [...rule.keywords ?? []] });
    } else {
      next.push({ category: rule.category, keywords: [...rule.keywords ?? []] });
    }
  }
  return { rules: next };
}
function withoutCategory(rules, category) {
  const name = String(category ?? "").trim();
  if (!name) return { rules: [...rules.rules ?? []] };
  return { rules: (rules.rules ?? []).filter((rule) => !sameName(rule.category, name)) };
}
function categoryNameProblem(name, existing, current = "") {
  return noteNameProblem(name, existing, current, "category");
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
function extractParty(sms, patterns) {
  const match = extractByPatterns(sms, patterns);
  if (!match) return "";
  return cleanCounterpartyName(match.groups?.name ?? match[1] ?? "");
}
var uniqueStrings = (values) => {
  const found = [];
  for (const value of values) {
    const clean = String(value ?? "").trim();
    if (clean && !found.includes(clean)) found.push(clean);
  }
  return found;
};
function mergeAccountSources(notes, config) {
  const accounts = [];
  const positionOf = /* @__PURE__ */ new Map();
  const add = (name, currency, endings, aliases) => {
    const clean = String(name ?? "").trim();
    if (!clean) return;
    const key2 = clean.toLocaleLowerCase();
    const at = positionOf.get(key2);
    if (at === void 0) {
      positionOf.set(key2, accounts.length);
      accounts.push({
        name: clean,
        currency: currency || void 0,
        card_endings: uniqueStrings(endings),
        aliases: uniqueStrings(aliases)
      });
      return;
    }
    const entry = accounts[at];
    if (!entry.currency && currency) entry.currency = currency;
    entry.card_endings = uniqueStrings([...entry.card_endings ?? [], ...endings]);
    entry.aliases = uniqueStrings([...entry.aliases ?? [], ...aliases]);
  };
  for (const note of notes) add(note.name, note.currency, note.cardEndings, note.aliases);
  for (const entry of config.accounts ?? []) {
    add(
      String(entry.name ?? ""),
      String(entry.currency ?? ""),
      (entry.card_endings ?? []).map(String),
      (entry.aliases ?? []).map(String)
    );
  }
  return { accounts };
}
function placeholderAccount(ending) {
  return `Card \u2022\u2022\u2022\u2022${ending}`;
}
function isPlaceholderAccount(value) {
  return /^Card ••••[0-9]+$/u.test(String(value ?? "").trim());
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
  if (!found.length && ending) found.push(placeholderAccount(ending));
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
  const isTransfer = hasKeyword(sms, patterns.transfer_keywords);
  const isFee = hasKeyword(sms, patterns.fee_keywords);
  const isCredit = hasKeyword(sms, patterns.credit_keywords);
  const isDebit = hasKeyword(sms, patterns.debit_keywords);
  let transactionType = "";
  if (isTransfer) transactionType = "transfer";
  else if (isFee && !isCredit) transactionType = "fee";
  else if (isCredit && !isDebit) transactionType = "credit";
  else if (isDebit && !isCredit) transactionType = "debit";
  const role = roleForType(transactionType);
  const merchantName = extractParty(sms, patterns.merchant_patterns);
  const counterparty = role === "sender" ? extractParty(sms, patterns.sender_patterns) || merchantName : role === "recipient" ? extractParty(sms, patterns.recipient_patterns) || merchantName : merchantName || extractParty(sms, patterns.recipient_patterns);
  let fromAccount = "";
  let toAccount = "";
  if (transactionType === "debit" || transactionType === "fee") fromAccount = candidates[0] ?? "";
  else if (transactionType === "credit") toAccount = candidates[0] ?? "";
  else if (transactionType === "transfer") {
    const incoming = isCredit && !isDebit;
    fromAccount = incoming ? candidates[1] ?? "" : candidates[0] ?? "";
    toAccount = incoming ? candidates[0] ?? "" : candidates[1] ?? "";
  }
  let category = categorize(`${sms}
${counterparty}`, categories);
  if (transactionType === "fee") category = "Fees";
  else if (transactionType === "transfer" && category === "Uncategorized") category = "Transfer";
  const resolved = candidates.some((candidate) => !isPlaceholderAccount(candidate));
  const checks = [amount !== null, Boolean(currency), Boolean(transactionType), resolved];
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
    ...counterpartyFields(counterparty, role),
    transaction_type: transactionType,
    status: complete ? "parsed" : "pending",
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

// src/data/records.ts
var TYPES = ["debit", "credit", "transfer", "fee"];
var STATUSES = ["pending", "parsed"];
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
  const { counterparty, counterpartyRole } = readCounterparty({
    merchant: readString(frontmatter.merchant),
    recipient: readString(frontmatter.recipient),
    sender: readString(frontmatter.sender)
  });
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
    counterparty,
    counterpartyRole,
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
    // Whitespace is collapsed because a bank pads its messages with runs of
    // spaces, and a search typed with single ones would otherwise miss them.
    searchBlob: [counterparty, smsMessage, category, fromAccount, toAccount].filter(Boolean).join(" ").replace(/\s+/gu, " ").toLowerCase()
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
  // The three party keys are one field: a name already under any of them means
  // the note names its party, so the parser leaves all three alone.
  merchant: "counterparty",
  recipient: "counterparty",
  sender: "counterparty",
  transaction_type: "type",
  status: "status",
  parser_confidence: "parserConfidence",
  transaction_id: "transactionId"
};
function toRecordKey(frontmatterKey) {
  return RECORD_KEYS[frontmatterKey] ?? null;
}
var PARSER_OWNED = /* @__PURE__ */ new Set(["status", "parser_confidence", "transaction_id"]);
function isEmpty(value) {
  return value === null || value === void 0 || value === "";
}
function parserChanges(record, parsed) {
  const changes = {};
  for (const [key2, value] of Object.entries(parsed)) {
    const recordKey = toRecordKey(key2);
    if (!recordKey) continue;
    const current = record[recordKey];
    const isDefault = key2 === "category" && current === "Uncategorized" || (key2 === "from_account" || key2 === "to_account") && isPlaceholderAccount(current);
    if (!PARSER_OWNED.has(key2) && !isDefault && !isEmpty(current)) continue;
    if (isDefault && isEmpty(value)) continue;
    if (current === value || isEmpty(current) && isEmpty(value)) continue;
    changes[key2] = value;
  }
  return changes;
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
        if (file instanceof import_obsidian2.TFile) this.ingest(file);
        this.notify();
      })
    );
  }
  refreshPath(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof import_obsidian2.TFile) this.ingest(file);
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

// src/data/categories.ts
var import_obsidian5 = require("obsidian");

// src/data/create.ts
var import_obsidian4 = require("obsidian");

// src/data/vault-json.ts
var import_obsidian3 = require("obsidian");

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
    // Kept spelled "merchant" so existing rules keep working; it matches a
    // recipient or a sender just as well.
    case "merchant":
      return record.counterparty;
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
  const normalized = (0, import_obsidian3.normalizePath)(path);
  if (!normalized || normalized === "/") return;
  let current = "";
  for (const part of normalized.split("/")) {
    current = current ? `${current}/${part}` : part;
    const existing = app.vault.getAbstractFileByPath(current);
    if (!existing) await app.vault.createFolder(current);
    else if (!(existing instanceof import_obsidian3.TFolder)) throw new Error(`${current} exists but is not a folder.`);
  }
}
async function loadVaultJson(app, path, fallback) {
  const file = app.vault.getAbstractFileByPath((0, import_obsidian3.normalizePath)(path));
  if (!(file instanceof import_obsidian3.TFile)) return fallback;
  try {
    return JSON.parse(await app.vault.cachedRead(file));
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${error.message}`);
  }
}
async function saveVaultJson(app, path, value) {
  const normalized = (0, import_obsidian3.normalizePath)(path);
  const slash = normalized.lastIndexOf("/");
  if (slash > 0) await ensureFolder(app, normalized.slice(0, slash));
  const content = `${JSON.stringify(value, null, 2)}
`;
  const existing = app.vault.getAbstractFileByPath(normalized);
  if (existing instanceof import_obsidian3.TFile) await app.vault.process(existing, () => content);
  else if (existing) throw new Error(`${normalized} exists but is not a file.`);
  else await app.vault.create(normalized, content);
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
async function saveRules(app, rules) {
  await saveVaultJson(app, RULES_PATH, { rules });
}

// src/data/create.ts
var MONTHS2 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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
  for (const [key2, value] of Object.entries(params ?? {})) {
    if (KNOWN_PARAMS.has(key2)) continue;
    message += `&${key2}`;
    if (value !== null && value !== void 0 && String(value) !== "") message += `=${value}`;
  }
  return decodePercentEscapes(message);
}
var PERCENT_RUN = /(?:%[0-9A-Fa-f]{2})+/g;
var HAS_ESCAPE = /%[0-9A-Fa-f]{2}/;
function decodePercentEscapes(text, passes = 2) {
  let current = text;
  for (let pass = 0; pass < passes; pass += 1) {
    if (/\s/.test(current) || !HAS_ESCAPE.test(current)) break;
    current = current.replace(PERCENT_RUN, decodeRun);
  }
  return current;
}
function decodeRun(run) {
  for (let end = run.length; end >= 3; end -= 3) {
    try {
      return decodeURIComponent(run.slice(0, end)) + run.slice(end);
    } catch {
    }
  }
  return run;
}
function transactionPathParts(timestamp) {
  const direct = String(timestamp).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (direct) {
    return `${direct[1]}/${MONTHS2[Number(direct[2]) - 1]}/${direct[3]}T${direct[4]}-${direct[5]}-${direct[6]}`;
  }
  const date = new Date(timestamp);
  const usable = Number.isNaN(date.getTime()) ? /* @__PURE__ */ new Date() : date;
  const two = (value) => String(value).padStart(2, "0");
  return [
    usable.getFullYear(),
    MONTHS2[usable.getMonth()],
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
  const partyKey = roleForType(fields.transaction_type);
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
    fields.counterparty ? `${partyKey}: ${yamlString(fields.counterparty)}` : `${partyKey}:`,
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
  const normalized = (0, import_obsidian4.normalizePath)(vaultPath);
  const slash = normalized.lastIndexOf("/");
  if (slash > 0) await ensureFolder(app, normalized.slice(0, slash));
  const existing = app.vault.getAbstractFileByPath(normalized);
  if (existing instanceof import_obsidian4.TFile) await app.vault.process(existing, () => content);
  else if (existing) throw new Error(`${normalized} exists but is not a file.`);
  else await app.vault.create(normalized, content);
}
async function createFile(app, path, content) {
  await writeVaultFile(app, path, content);
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof import_obsidian4.TFile)) throw new Error(`Could not create ${path}.`);
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
    counterparty: "",
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
  const counterparty = protocolValue(params, "merchant", "recipient", "sender", "counterparty");
  const checks = [amount !== null, Boolean(currency), validType, Boolean(fromAccount || toAccount)];
  const complete = checks.every(Boolean);
  const fingerprint = [timestamp, amount, currency, transactionType, fromAccount, toAccount, counterparty].join("|");
  const path = uniqueTransactionPath(app, timestamp);
  const content = transactionMarkdown({
    timestamp,
    amount,
    currency,
    from_account: fromAccount,
    to_account: toAccount,
    category,
    counterparty,
    transaction_type: transactionType,
    status: complete ? "parsed" : "pending",
    source: "iphone-shortcut-fields",
    parser_confidence: checks.filter(Boolean).length / checks.length,
    transaction_id: stableId(fingerprint)
  }, sms);
  return createFile(app, path, content);
}
async function createManualTransaction(app, fields) {
  const path = uniqueTransactionPath(app, fields.timestamp);
  const content = transactionMarkdown({
    timestamp: fields.timestamp,
    amount: fields.amount,
    currency: fields.currency,
    from_account: fields.fromAccount,
    to_account: fields.toAccount,
    category: fields.category || "Uncategorized",
    counterparty: fields.counterparty,
    transaction_type: fields.type,
    status: "parsed",
    source: "manual-ui",
    parser_confidence: 1,
    transaction_id: stableId(
      [
        fields.timestamp,
        fields.amount,
        fields.currency,
        fields.type,
        fields.fromAccount,
        fields.toAccount,
        fields.counterparty
      ].join("|")
    )
  }, "", fields.note);
  return createFile(app, path, content);
}

// src/data/categories.ts
function categoryNotePath(name) {
  return `${CATEGORIES_DIR}/${String(name).trim()}.md`;
}
function categoryNote(draft) {
  const lines = [
    "---",
    "type: category",
    `name: ${JSON.stringify(draft.name)}`,
    `currency: ${draft.currency || "EGP"}`,
    `monthly_budget:${draft.monthlyBudget === null ? "" : ` ${draft.monthlyBudget}`}`
  ];
  if (draft.color) lines.push(`color: "${draft.color}"`);
  if (draft.icon) lines.push(`icon: ${draft.icon}`);
  lines.push("---", "", `# ${draft.name}`, "");
  return lines.join("\n");
}
async function createCategoryNote(app, draft) {
  const path = (0, import_obsidian5.normalizePath)(categoryNotePath(draft.name));
  if (app.vault.getAbstractFileByPath(path)) throw new Error(`${path} already exists.`);
  await writeVaultFile(app, path, categoryNote(draft));
  return path;
}
async function renameCategoryNote(app, path, name) {
  const file = app.vault.getAbstractFileByPath((0, import_obsidian5.normalizePath)(path));
  if (!(file instanceof import_obsidian5.TFile)) throw new Error(`${path} is not a file.`);
  const wanted = (0, import_obsidian5.normalizePath)(categoryNotePath(name));
  if (wanted !== file.path) {
    if (app.vault.getAbstractFileByPath(wanted)) throw new Error(`${wanted} already exists.`);
    await app.fileManager.renameFile(file, wanted);
  }
  const moved = app.vault.getAbstractFileByPath(wanted);
  if (!(moved instanceof import_obsidian5.TFile)) throw new Error(`Could not find ${wanted} after renaming.`);
  await app.fileManager.processFrontMatter(moved, (frontmatter) => {
    frontmatter.name = String(name).trim();
  });
  return wanted;
}
async function deleteCategoryNote(app, path) {
  const file = app.vault.getAbstractFileByPath((0, import_obsidian5.normalizePath)(path));
  if (!(file instanceof import_obsidian5.TFile)) throw new Error(`${path} is not a file.`);
  await app.fileManager.trashFile(file);
}

// src/data/inbox.ts
var import_obsidian6 = require("obsidian");

// src/domain/parser/relevance.ts
var DEFAULT_TRANSACTION_KEYWORDS = [
  // Money leaving.
  "\u062A\u0645 \u062E\u0635\u0645",
  "\u062E\u0635\u0645 \u0645\u0646 \u062D\u0633\u0627\u0628\u0643",
  "\u0645\u0646 \u062D\u0633\u0627\u0628\u0643",
  "\u0645\u0646 \u0628\u0637\u0627\u0642\u062A\u0643",
  "\u062A\u0645 \u0633\u062D\u0628",
  "\u0633\u062D\u0628 \u0645\u0646 \u062D\u0633\u0627\u0628\u0643",
  "\u062A\u0645 \u0634\u0631\u0627\u0621",
  "\u062A\u0645 \u062F\u0641\u0639",
  "from your account",
  "from your card",
  "charged",
  "debited",
  "withdrawn",
  "withdrawal",
  "purchase",
  // Money arriving.
  "\u0625\u0644\u0649 \u062D\u0633\u0627\u0628\u0643",
  "\u0644\u062D\u0633\u0627\u0628\u0643",
  "\u062A\u0645 \u0625\u064A\u062F\u0627\u0639",
  "\u062A\u0645 \u0627\u0636\u0627\u0641\u0629",
  "to your account",
  "to your card",
  "credited",
  "deposited",
  "refunded",
  // Either way.
  "\u062A\u0645 \u062A\u0646\u0641\u064A\u0630 \u062A\u062D\u0648\u064A\u0644",
  "\u062A\u0645 \u062A\u062D\u0648\u064A\u0644",
  "transferred"
];
function isTransactionMessage(sms, patterns = {}) {
  const keywords = patterns.transaction_keywords?.length ? patterns.transaction_keywords : DEFAULT_TRANSACTION_KEYWORDS;
  return hasKeyword(sms, keywords);
}

// src/data/inbox.ts
var CAPTURE_EXTENSIONS = /* @__PURE__ */ new Set(["txt", "md", "text", "log"]);
var NEVER_A_MESSAGE = /* @__PURE__ */ new Set(["readme.md"]);
function basenameOf(path) {
  return path.slice(path.lastIndexOf("/") + 1).toLowerCase();
}
function extensionOf(path) {
  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  return dot > slash ? path.slice(dot + 1).toLowerCase() : "";
}
async function ingestInbox(app, patterns = {}) {
  const result = { created: [], empty: [], ignored: [], failed: [] };
  const directory = (0, import_obsidian6.normalizePath)(INBOX_DIR);
  const adapter = app.vault.adapter;
  if (!await adapter.exists(directory)) return result;
  const listed = await adapter.list(directory);
  for (const path of [...listed.files].sort()) {
    if (!CAPTURE_EXTENSIONS.has(extensionOf(path))) continue;
    if (NEVER_A_MESSAGE.has(basenameOf(path))) continue;
    try {
      const message = decodePercentEscapes((await adapter.read(path)).trim());
      if (!message) {
        result.empty.push(path);
        continue;
      }
      if (!isTransactionMessage(message, patterns)) {
        await adapter.remove(path);
        result.ignored.push(path);
        continue;
      }
      const file = await createRawSmsTransaction(app, { message }, patterns);
      await adapter.remove(path);
      result.created.push(file.path);
    } catch (error) {
      result.failed.push({ path, error: error.message });
    }
  }
  return result;
}
function describeInbox(result) {
  const parts = [];
  if (result.created.length) parts.push(`captured ${result.created.length} message(s) from the inbox`);
  if (result.ignored.length) parts.push(`discarded ${result.ignored.length} non-transaction message(s)`);
  if (result.failed.length) parts.push(`${result.failed.length} failed`);
  if (result.empty.length) parts.push(`${result.empty.length} empty file(s) left in place`);
  return parts.length ? parts.join(", ") : null;
}

// src/ui/export-csv.ts
var COLUMNS = [
  "date",
  "time",
  "amount",
  "currency",
  "type",
  "from_account",
  "to_account",
  "counterparty",
  "counterparty_role",
  "category",
  "status",
  "excluded",
  "exclude_reason",
  "transaction_id",
  "file"
];
function cell(value) {
  const text = value === null || value === void 0 ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function toCsv(records) {
  const lines = [COLUMNS.join(",")];
  for (const record of records) {
    lines.push([
      record.date ?? "",
      record.time ?? "",
      record.amount ?? "",
      record.currency,
      record.type,
      record.fromAccount,
      record.toAccount,
      record.counterparty,
      record.counterpartyRole,
      record.category,
      record.status,
      record.excluded,
      record.excludeReason,
      record.transactionId,
      record.path
    ].map(cell).join(","));
  }
  return `${lines.join("\n")}
`;
}
async function exportCsv(app, records, label) {
  const folder = `${VAULT_ROOT}Exports`;
  await ensureFolder(app, folder);
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "export";
  const path = `${folder}/transactions-${slug}.csv`;
  const content = toCsv(records);
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing) await app.vault.adapter.write(path, content);
  else await app.vault.create(path, content);
  return path;
}

// src/data/write.ts
var import_obsidian7 = require("obsidian");
async function editFrontMatter(app, path, edit) {
  const file = app.vault.getAbstractFileByPath((0, import_obsidian7.normalizePath)(path));
  if (!(file instanceof import_obsidian7.TFile)) throw new Error(`${path} is not a file.`);
  await app.fileManager.processFrontMatter(file, edit);
}
async function updateTransaction(app, path, changes) {
  await editFrontMatter(app, path, (frontmatter) => {
    for (const [key2, value] of Object.entries(changes)) {
      if (value === null || value === "") delete frontmatter[key2];
      else frontmatter[key2] = value;
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
async function updateCategoryNote(app, path, changes) {
  await editFrontMatter(app, path, (frontmatter) => {
    if (changes.color !== void 0) frontmatter.color = changes.color || null;
    if (changes.icon !== void 0) frontmatter.icon = changes.icon || null;
    if (changes.monthly_budget !== void 0) frontmatter.monthly_budget = changes.monthly_budget;
  });
}
async function updateAccountNote(app, path, changes) {
  await editFrontMatter(app, path, (frontmatter) => {
    for (const [key2, value] of Object.entries(changes)) {
      if (value === void 0) continue;
      if (value === null) delete frontmatter[key2];
      else frontmatter[key2] = value;
    }
  });
}

// src/domain/parser/defaults.ts
var DEFAULT_PARTY_PATTERNS = {
  merchant_patterns: [
    "(?i)(?:at|merchant)\\s+(?P<name>[A-Za-z0-9][A-Za-z0-9 .&'/_-]{1,60}?)(?=\\s+(?:on|using|with|via|balance|available|ref|reference|date)\\b|[.;,]|$)",
    "(?i)(?:\u0639\u0646\u062F|\u0644\u062F\u0649|\u0645\u0646\\s+\u0645\u062D\u0644)\\s+(?P<name>[^.;,\\n]{2,60}?)(?=\\s+(?:\u0641\u064A|\u0628\u062A\u0627\u0631\u064A\u062E|\u0627\u0644\u0631\u0635\u064A\u062F|\u0645\u0631\u062C\u0639|\u0628\u0648\u0627\u0633\u0637\u0629|\u0628\u0627\u0633\u062A\u062E\u062F\u0627\u0645)|[.;,]|$)"
  ],
  recipient_patterns: [
    "(?i)\\bto\\s+(?!your\\b|the\\b|a/c\\b|acct\\b|account\\b|card\\b|wallet\\b)(?P<name>[A-Za-z0-9][A-Za-z0-9 .&'/_-]{1,60}?)(?=\\s+(?:on|using|with|via|from|balance|available|ref|reference|date)\\b|[.;,]|$)",
    "(?i)(?:\u0625\u0644\u0649|\u0627\u0644\u0649|\u0644\u062D\u0633\u0627\u0628|\u0644\u0635\u0627\u0644\u062D)\\s+(?!\u0628\u0637\u0627\u0642\u0629|\u062D\u0633\u0627\u0628|\u0631\u0642\u0645)(?P<name>[^.;,\\n]{2,60}?)(?=\\s+(?:\u0641\u064A|\u0628\u062A\u0627\u0631\u064A\u062E|\u0627\u0644\u0631\u0635\u064A\u062F|\u0645\u0631\u062C\u0639|\u0628\u0648\u0627\u0633\u0637\u0629|\u0628\u0627\u0633\u062A\u062E\u062F\u0627\u0645)|[.;,]|$)"
  ],
  sender_patterns: [
    "(?i)\\bfrom\\s+(?!your\\b|the\\b|a/c\\b|acct\\b|account\\b|card\\b|wallet\\b)(?P<name>[A-Za-z0-9][A-Za-z0-9 .&'/_-]{1,60}?)(?=\\s+(?:on|using|with|via|to|balance|available|ref|reference|date)\\b|[.;,]|$)",
    "(?i)\u0645\u0646\\s+(?!\u0628\u0637\u0627\u0642\u0629|\u062D\u0633\u0627\u0628|\u0631\u0642\u0645|\u062E\u0644\u0627\u0644)(?P<name>[^.;,\\n]{2,60}?)(?=\\s+(?:\u0641\u064A|\u0628\u062A\u0627\u0631\u064A\u062E|\u0627\u0644\u0631\u0635\u064A\u062F|\u0645\u0631\u062C\u0639|\u0625\u0644\u0649|\u0627\u0644\u0649|\u0628\u0648\u0627\u0633\u0637\u0629|\u0628\u0627\u0633\u062A\u062E\u062F\u0627\u0645)|[.;,]|$)"
  ]
};
var DEFAULT_KEYWORDS = {
  debit_keywords: ["\u0645\u0646 \u062D\u0633\u0627\u0628\u0643", "\u0645\u0646 \u0628\u0637\u0627\u0642\u062A\u0643", "\u062A\u0645 \u062E\u0635\u0645", "from your account", "from your card"],
  credit_keywords: ["\u0625\u0644\u0649 \u062D\u0633\u0627\u0628\u0643", "\u0644\u062D\u0633\u0627\u0628\u0643", "to your account", "to your card"],
  transaction_keywords: DEFAULT_TRANSACTION_KEYWORDS
};
function withDefaultPatterns(patterns) {
  const merged = { ...patterns };
  const defaultsByKey = { ...DEFAULT_PARTY_PATTERNS, ...DEFAULT_KEYWORDS };
  for (const [key2, defaults] of Object.entries(defaultsByKey)) {
    const own = patterns[key2] ?? [];
    merged[key2] = [
      ...own,
      ...defaults.filter((pattern) => !own.includes(pattern))
    ];
  }
  return merged;
}

// src/settings.ts
var import_obsidian9 = require("obsidian");

// src/ui/components/rules-editor.ts
var import_obsidian8 = require("obsidian");
var FIELD_LABELS = {
  sms_message: "SMS text",
  merchant: "Merchant, recipient or sender",
  from_account: "From account",
  to_account: "To account",
  category: "Category",
  transaction_type: "Type",
  amount: "Amount",
  timestamp: "Timestamp"
};
var OP_LABELS = {
  contains: "contains",
  not_contains: "does not contain",
  equals: "is exactly",
  not_equals: "is not",
  starts_with: "starts with",
  ends_with: "ends with",
  matches: "matches regex",
  gt: "is greater than",
  lt: "is less than",
  between: "is between"
};
var RulesEditorModal = class extends import_obsidian8.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.rules = [];
    this.loadError = null;
  }
  async onOpen() {
    this.modalEl.addClass("fin-sheet");
    const loaded = await loadRules(this.app);
    this.rules = loaded.rules;
    this.loadError = loaded.error;
    this.draw();
  }
  draw() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Exclusion rules" });
    contentEl.createEl("p", {
      cls: "fin-sheet-note",
      text: "A matching transaction is excluded from every calculation but stays in the list. A transaction you excluded by hand is never touched by a rule."
    });
    if (this.loadError) {
      const problem = contentEl.createDiv({ cls: "fin-rule-error" });
      problem.createEl("strong", { text: "Some rules could not be read:" });
      problem.createEl("pre", { text: this.loadError });
      problem.createEl("p", { text: "Fix Budget/Settings/exclusion_rules.json, then reopen this window. Saving from here would discard the rules that failed to load." });
      return;
    }
    const records = this.plugin.index.transactions();
    if (!this.rules.length) {
      contentEl.createEl("p", { text: "No rules yet." });
    }
    for (const rule of this.rules) {
      const matches = records.filter((record) => matchesRule(record, { ...rule, enabled: true })).length;
      const setting = new import_obsidian8.Setting(contentEl).setName(rule.name).setDesc(`${this.describe(rule)} \u2014 matches ${matches} transaction${matches === 1 ? "" : "s"}`);
      setting.addToggle(
        (toggle) => toggle.setValue(rule.enabled).onChange(async (value) => {
          rule.enabled = value;
          await this.persist();
        })
      );
      setting.addButton(
        (button) => button.setIcon("pencil").setTooltip("Edit").onClick(() => {
          new RuleEditModal(this.app, this.plugin, rule, async (updated) => {
            const position = this.rules.findIndex((item) => item.id === rule.id);
            this.rules[position] = updated;
            await this.persist();
            this.draw();
          }).open();
        })
      );
      setting.addButton(
        (button) => button.setIcon("trash").setTooltip("Delete").setWarning().onClick(async () => {
          this.rules = this.rules.filter((item) => item.id !== rule.id);
          await this.persist();
          this.draw();
        })
      );
    }
    const actions = contentEl.createDiv({ cls: "fin-sheet-actions" });
    const add = actions.createEl("button", { text: "New rule" });
    add.addEventListener("click", () => {
      new RuleEditModal(this.app, this.plugin, null, async (created) => {
        this.rules.push(created);
        await this.persist();
        this.draw();
      }).open();
    });
    const apply = actions.createEl("button", { cls: "mod-cta", text: "Apply to all transactions" });
    apply.addEventListener("click", async () => {
      const updated = await this.plugin.applyRulesToAll();
      new import_obsidian8.Notice(`Updated ${updated} transaction${updated === 1 ? "" : "s"}.`);
      this.draw();
    });
  }
  describe(rule) {
    const joiner = rule.match === "all" ? " and " : " or ";
    return rule.conditions.map((condition) => `${FIELD_LABELS[condition.field]} ${OP_LABELS[condition.op]} "${condition.value}"`).join(joiner);
  }
  async persist() {
    try {
      await saveRules(this.app, this.rules);
    } catch (error) {
      new import_obsidian8.Notice(`Could not save the rules: ${error.message}`);
    }
  }
};
var RuleEditModal = class extends import_obsidian8.Modal {
  constructor(app, plugin, existing, onSave) {
    super(app);
    this.plugin = plugin;
    this.onSave = onSave;
    this.rule = existing ? JSON.parse(JSON.stringify(existing)) : {
      id: `rule-${Date.now().toString(36)}`,
      name: "",
      enabled: true,
      reason: "",
      match: "all",
      conditions: [{ field: "sms_message", op: "contains", value: "" }]
    };
  }
  onOpen() {
    this.modalEl.addClass("fin-sheet");
    this.draw();
  }
  draw() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.rule.name || "New rule" });
    new import_obsidian8.Setting(contentEl).setName("Name").addText(
      (text) => text.setPlaceholder("Transfer to my own account").setValue(this.rule.name).onChange((value) => {
        this.rule.name = value;
      })
    );
    new import_obsidian8.Setting(contentEl).setName("Reason").setDesc("Shown on every transaction this rule excludes.").addText(
      (text) => text.setPlaceholder("Transfer between my own accounts").setValue(this.rule.reason).onChange((value) => {
        this.rule.reason = value;
      })
    );
    new import_obsidian8.Setting(contentEl).setName("Match").addDropdown((dropdown) => {
      dropdown.addOption("all", "All conditions");
      dropdown.addOption("any", "Any condition");
      dropdown.setValue(this.rule.match).onChange((value) => {
        this.rule.match = value;
        this.refreshPreview();
      });
    });
    contentEl.createEl("h3", { text: "Conditions" });
    this.rule.conditions.forEach((condition, position) => {
      const row = contentEl.createDiv({ cls: "fin-condition" });
      const field = row.createEl("select", { cls: "fin-condition-part" });
      for (const name of RULE_FIELDS) field.createEl("option", { value: name, text: FIELD_LABELS[name] });
      field.value = condition.field;
      field.addEventListener("change", () => {
        condition.field = field.value;
        this.refreshPreview();
      });
      const op = row.createEl("select", { cls: "fin-condition-part" });
      for (const name of RULE_OPS) op.createEl("option", { value: name, text: OP_LABELS[name] });
      op.value = condition.op;
      op.addEventListener("change", () => {
        condition.op = op.value;
        this.draw();
      });
      const value = row.createEl("input", {
        cls: "fin-condition-part",
        attr: { type: "text", placeholder: "value", value: String(condition.value ?? "") }
      });
      value.addEventListener("input", () => {
        condition.value = value.value;
        this.refreshPreview();
      });
      if (condition.op === "between") {
        const second = row.createEl("input", {
          cls: "fin-condition-part",
          attr: { type: "text", placeholder: "and", value: String(condition.value2 ?? "") }
        });
        second.addEventListener("input", () => {
          condition.value2 = second.value;
          this.refreshPreview();
        });
      }
      const remove = row.createEl("button", { cls: "fin-condition-remove", text: "\xD7" });
      remove.setAttribute("aria-label", "Remove condition");
      remove.addEventListener("click", () => {
        this.rule.conditions.splice(position, 1);
        this.draw();
      });
    });
    const add = contentEl.createEl("button", { cls: "fin-more", text: "Add condition" });
    add.addEventListener("click", () => {
      this.rule.conditions.push({ field: "sms_message", op: "contains", value: "" });
      this.draw();
    });
    this.previewEl = contentEl.createDiv({ cls: "fin-rule-preview" });
    this.refreshPreview();
    const actions = contentEl.createDiv({ cls: "fin-sheet-actions" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const save = actions.createEl("button", { cls: "mod-cta", text: "Save rule" });
    save.addEventListener("click", () => void this.save());
  }
  /** Shows what the rule would catch before it is saved. */
  refreshPreview() {
    this.previewEl.empty();
    const errors = validateRule(this.rule);
    if (errors.length) {
      this.previewEl.createEl("p", { cls: "fin-rule-error-text", text: errors[0] });
      return;
    }
    const records = this.plugin.index.transactions();
    const matches = records.filter((record) => matchesRule(record, { ...this.rule, enabled: true }));
    this.previewEl.createEl("p", {
      text: `Matches ${matches.length} of ${records.length} transactions.`
    });
    const manual = matches.filter((record) => record.excluded && record.excludeSource === "manual").length;
    if (manual) {
      this.previewEl.createEl("p", {
        cls: "fin-sheet-note",
        text: `${manual} of those were excluded by hand and will not be changed.`
      });
    }
    const list = this.previewEl.createEl("ul", { cls: "fin-rule-preview-list" });
    for (const record of matches.slice(0, 5)) {
      list.createEl("li", {
        text: `${record.date ?? "?"} \xB7 ${record.counterparty || record.category} \xB7 ${record.amount ?? "?"} ${record.currency}`
      });
    }
  }
  async save() {
    const errors = validateRule(this.rule);
    if (errors.length) {
      new import_obsidian8.Notice(errors.join("\n"));
      return;
    }
    if (!this.rule.reason) this.rule.reason = this.rule.name;
    await this.onSave(this.rule);
    this.close();
  }
};

// src/settings.ts
var DEFAULT_SETTINGS = {
  runOnStartup: true,
  watchTransactions: true,
  applyExclusionRules: true
};
var FinanceAutomationSettingTab = class extends import_obsidian9.PluginSettingTab {
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
    new import_obsidian9.Setting(containerEl).setName("Process when Obsidian starts").setDesc("Parse pending notes shortly after opening the vault.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.runOnStartup).onChange(async (value) => {
        this.plugin.settings.runOnStartup = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian9.Setting(containerEl).setName("Watch transaction notes").setDesc("Run automatically shortly after a transaction note is created or changed.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.watchTransactions).onChange(async (value) => {
        this.plugin.settings.watchTransactions = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian9.Setting(containerEl).setName("Exclusion rules").setDesc("Rules that automatically exclude matching transactions from calculations.").addButton(
      (button) => button.setButtonText("Edit rules").onClick(() => {
        new RulesEditorModal(this.app, this.plugin).open();
      })
    );
    new import_obsidian9.Setting(containerEl).setName("Apply exclusion rules automatically").setDesc("Run the exclusion rules whenever a transaction note is created or changed.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.applyExclusionRules).onChange(async (value) => {
        this.plugin.settings.applyExclusionRules = value;
        await this.plugin.saveSettings();
      })
    );
  }
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
  toggle(key2, name) {
    const current = this.filter[key2];
    const next = current.includes(name) ? current.filter((item) => item !== name) : [...current, name];
    this.set({ [key2]: next });
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
var import_obsidian22 = require("obsidian");

// src/ui/components/period-picker.ts
var import_obsidian10 = require("obsidian");
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
    (0, import_obsidian10.setIcon)(back, "chevron-left");
    back.addEventListener("click", () => this.store.step(-1));
    const label = stepper.createEl("button", { cls: "fin-period-label", text: periodLabel(period) });
    label.addEventListener("click", (event) => this.openUnitMenu(event, today));
    const forward = stepper.createEl("button", { cls: "fin-icon-button", attr: { "aria-label": "Next period" } });
    (0, import_obsidian10.setIcon)(forward, "chevron-right");
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
    const menu = new import_obsidian10.Menu();
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
var import_obsidian11 = require("obsidian");
var TYPE_OPTIONS = [
  { value: "debit", label: "Spending" },
  { value: "credit", label: "Income" },
  { value: "transfer", label: "Transfers" },
  { value: "fee", label: "Fees" }
];
var STATUS_OPTIONS = [
  { value: "parsed", label: "Parsed" },
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
    (0, import_obsidian11.setIcon)(searchIcon, "search");
    const input = searchRow.createEl("input", {
      cls: "fin-search-input",
      attr: { type: "search", placeholder: "Search name, SMS, category", value: filter.search }
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
      const menu = new import_obsidian11.Menu();
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
      const menu = new import_obsidian11.Menu();
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
var import_obsidian14 = require("obsidian");

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
    const cell2 = row.createDiv({ cls: "fin-summary-cell" });
    cell2.createDiv({ cls: "fin-summary-label", text: label });
    cell2.createDiv({ cls: `fin-summary-value fin-amount ${tone}`, text: value });
  }
};

// src/ui/components/transaction-row.ts
var import_obsidian12 = require("obsidian");
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
    (0, import_obsidian12.setIcon)(glyph, categoryIcon(record.category, this.categories));
    const text = row.createDiv({ cls: "fin-row-text" });
    const primary = record.counterparty || record.category || record.type || "Transaction";
    text.createDiv({ cls: "fin-row-primary", text: primary });
    const secondaryParts = [
      record.fromAccount || record.toAccount,
      formatTime(record.time)
    ].filter(Boolean);
    text.createDiv({ cls: "fin-row-secondary", text: secondaryParts.join(" \xB7 ") });
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
var import_obsidian13 = require("obsidian");
function renderEmptyState(container, icon, title, body) {
  const wrapper = container.createDiv({ cls: "fin-empty" });
  const iconEl = wrapper.createDiv({ cls: "fin-empty-icon" });
  (0, import_obsidian13.setIcon)(iconEl, icon);
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
  renderAddButton(container) {
    const button = container.createEl("button", { cls: "fin-fab", attr: { "aria-label": "Add transaction" } });
    (0, import_obsidian14.setIcon)(button, "plus");
    button.addEventListener("click", () => this.plugin.openAddTransactionModal());
  }
  openQuickMenu(record, event) {
    const menu = new import_obsidian14.Menu();
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
          new import_obsidian14.Notice(`Could not update the transaction: ${error.message}`);
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
            new import_obsidian14.Notice(`Could not set the category: ${error.message}`);
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

// src/ui/tabs/accounts-tab.ts
var import_obsidian17 = require("obsidian");

// src/domain/balances.ts
var key = (name) => name.trim().toLowerCase();
function deriveBalances(accounts, records) {
  const active = accounts.filter((account) => account.active);
  const byKey = new Map(active.map((account) => [key(account.name), account]));
  const state = /* @__PURE__ */ new Map();
  for (const account of active) state.set(key(account.name), { moneyIn: 0, moneyOut: 0, count: 0 });
  for (const record of records) {
    if (record.excluded || record.amount === null) continue;
    const value = Math.abs(record.amount);
    const apply = (name, direction) => {
      const accountKey = key(name);
      const account = byKey.get(accountKey);
      if (!account) return false;
      if (account.openingDate && record.date && record.date < account.openingDate) return false;
      const bucket = state.get(accountKey);
      if (direction === "in") bucket.moneyIn += value;
      else bucket.moneyOut += value;
      bucket.count += 1;
      return true;
    };
    if (record.type === "credit") {
      apply(record.toAccount || record.fromAccount, "in");
    } else if (record.type === "debit" || record.type === "fee") {
      apply(record.fromAccount, "out");
    } else if (record.type === "transfer") {
      apply(record.fromAccount, "out");
      apply(record.toAccount, "in");
    }
  }
  return active.map((account) => {
    const bucket = state.get(key(account.name));
    const balance = account.openingBalance + bucket.moneyIn - bucket.moneyOut;
    return {
      account,
      balance,
      moneyIn: bucket.moneyIn,
      moneyOut: bucket.moneyOut,
      transactionCount: bucket.count,
      drift: account.referenceBalance === null ? null : account.referenceBalance - balance
    };
  });
}
function netWorthByCurrency(balances) {
  const result = /* @__PURE__ */ new Map();
  for (const item of balances) {
    if (!item.account.includeInNetWorth) continue;
    const currency = item.account.currency || "Unknown";
    result.set(currency, (result.get(currency) ?? 0) + item.balance);
  }
  return result;
}
function unknownAccountNames(accounts, records) {
  const known = new Set(accounts.map((account) => key(account.name)));
  const unknown = /* @__PURE__ */ new Map();
  for (const record of records) {
    for (const name of [record.fromAccount, record.toAccount]) {
      if (!name) continue;
      if (known.has(key(name))) continue;
      if (!unknown.has(key(name))) unknown.set(key(name), name.trim());
    }
  }
  return [...unknown.values()].sort((a, b) => a.localeCompare(b));
}

// src/ui/components/account-editor.ts
var import_obsidian16 = require("obsidian");

// src/data/accounts.ts
var import_obsidian15 = require("obsidian");
function accountNotePath(name) {
  return `${ACCOUNTS_DIR}/${String(name).trim()}.md`;
}
function yamlList(key2, values) {
  if (!values.length) return `${key2}: []`;
  return [`${key2}:`, ...values.map((value) => `  - ${JSON.stringify(value)}`)].join("\n");
}
function accountNote(draft) {
  const lines = [
    "---",
    "type: account",
    `name: ${JSON.stringify(draft.name)}`,
    `currency: ${draft.currency || "EGP"}`,
    `account_type: ${draft.accountType || "bank"}`,
    `institution: ${JSON.stringify(draft.institution)}`,
    yamlList("card_endings", draft.cardEndings),
    yamlList("aliases", draft.aliases),
    `opening_balance: ${draft.openingBalance}`,
    `opening_date: ${JSON.stringify(draft.openingDate)}`,
    `balance:${draft.referenceBalance === null ? "" : ` ${draft.referenceBalance}`}`,
    `active: ${draft.active}`,
    `include_in_net_worth: ${draft.includeInNetWorth}`,
    "tags:",
    "  - finance/account",
    "---",
    "",
    `# ${draft.name}`,
    "",
    "List every digit group the bank uses for this account under `card_endings` \u2014 a debit",
    "card, a credit card, and the account number can all belong to one note, and the SMS",
    "parser files a message to this account when it sees any of them.",
    "",
    "`opening_balance` is the balance on `opening_date`. The Budget view derives the current",
    "balance from it plus every transaction since.",
    ""
  ];
  return lines.join("\n");
}
async function createAccountNote(app, draft) {
  const path = (0, import_obsidian15.normalizePath)(accountNotePath(draft.name));
  if (app.vault.getAbstractFileByPath(path)) throw new Error(`${path} already exists.`);
  await writeVaultFile(app, path, accountNote(draft));
  return path;
}
async function renameAccountNote(app, path, name) {
  const file = app.vault.getAbstractFileByPath((0, import_obsidian15.normalizePath)(path));
  if (!(file instanceof import_obsidian15.TFile)) throw new Error(`${path} is not a file.`);
  const wanted = (0, import_obsidian15.normalizePath)(accountNotePath(name));
  if (wanted !== file.path) {
    if (app.vault.getAbstractFileByPath(wanted)) throw new Error(`${wanted} already exists.`);
    await app.fileManager.renameFile(file, wanted);
  }
  const moved = app.vault.getAbstractFileByPath(wanted);
  if (!(moved instanceof import_obsidian15.TFile)) throw new Error(`Could not find ${wanted} after renaming.`);
  await app.fileManager.processFrontMatter(moved, (frontmatter) => {
    frontmatter.name = String(name).trim();
  });
  return wanted;
}

// src/ui/components/account-editor.ts
var ACCOUNT_TYPES = [
  { id: "bank", label: "Bank account" },
  { id: "card", label: "Credit card" },
  { id: "wallet", label: "Wallet" },
  { id: "cash", label: "Cash" }
];
function toList(text) {
  const seen = /* @__PURE__ */ new Set();
  const items = [];
  for (const raw of String(text ?? "").split(",")) {
    const value = raw.trim();
    const folded = value.toLocaleLowerCase();
    if (!value || seen.has(folded)) continue;
    seen.add(folded);
    items.push(value);
  }
  return items;
}
function draftOf(account) {
  if (!account) {
    return {
      name: "",
      institution: "",
      accountType: "bank",
      currency: "EGP",
      cardEndings: "",
      aliases: "",
      openingBalance: "0",
      openingDate: "",
      referenceBalance: "",
      active: true,
      includeInNetWorth: true
    };
  }
  return {
    name: account.name,
    institution: account.institution,
    accountType: account.accountType || "bank",
    currency: account.currency,
    cardEndings: account.cardEndings.join(", "),
    aliases: account.aliases.join(", "),
    openingBalance: String(account.openingBalance),
    openingDate: account.openingDate ?? "",
    referenceBalance: account.referenceBalance === null ? "" : String(account.referenceBalance),
    active: account.active,
    includeInNetWorth: account.includeInNetWorth
  };
}
var AccountEditorModal = class extends import_obsidian16.Modal {
  constructor(app, plugin, account, suggestedName = "") {
    super(app);
    this.plugin = plugin;
    this.account = account;
    this.saving = false;
    this.draft = draftOf(account);
    if (!account && suggestedName) this.draft.name = suggestedName;
  }
  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass("fin-sheet");
    contentEl.empty();
    contentEl.createEl("h2", { text: this.account ? `Edit ${this.account.name}` : "New account" });
    const problem = contentEl.createEl("p", { cls: "fin-rule-error-text is-hidden" });
    const clearProblem = () => problem.addClass("is-hidden");
    new import_obsidian16.Setting(contentEl).setName("Name").setDesc("The name on the note and on every transaction filed to this account.").addText((text) => {
      text.setPlaceholder("CIB").setValue(this.draft.name).onChange((value) => {
        this.draft.name = value;
        clearProblem();
      });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });
    new import_obsidian16.Setting(contentEl).setName("Bank").addText(
      (text) => text.setPlaceholder("CIB").setValue(this.draft.institution).onChange((value) => {
        this.draft.institution = value;
      })
    );
    new import_obsidian16.Setting(contentEl).setName("Type").addDropdown((dropdown) => {
      for (const type of ACCOUNT_TYPES) dropdown.addOption(type.id, type.label);
      if (!ACCOUNT_TYPES.some((type) => type.id === this.draft.accountType)) {
        dropdown.addOption(this.draft.accountType, this.draft.accountType);
      }
      dropdown.setValue(this.draft.accountType).onChange((value) => {
        this.draft.accountType = value;
      });
    });
    new import_obsidian16.Setting(contentEl).setName("Currency").addText(
      (text) => text.setPlaceholder("EGP").setValue(this.draft.currency).onChange((value) => {
        this.draft.currency = value;
      })
    );
    new import_obsidian16.Setting(contentEl).setName("Card endings").setDesc(
      "Separated by commas. Every digit group the bank uses for this account \u2014 a debit card, a credit card and the account number can all belong here, and a message naming any of them files itself to this account."
    ).addText(
      (text) => text.setPlaceholder("0779, 1934").setValue(this.draft.cardEndings).onChange((value) => {
        this.draft.cardEndings = value;
      })
    );
    new import_obsidian16.Setting(contentEl).setName("Other names").setDesc("Separated by commas. Wordings the bank uses for this account in its messages.").addText(
      (text) => text.setPlaceholder("cib, current account").setValue(this.draft.aliases).onChange((value) => {
        this.draft.aliases = value;
      })
    );
    new import_obsidian16.Setting(contentEl).setName("Starting balance").setDesc("What the account held on the starting date. Every transaction since is added to it.").addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.inputMode = "decimal";
      text.setPlaceholder("0").setValue(this.draft.openingBalance).onChange((value) => {
        this.draft.openingBalance = value;
        clearProblem();
      });
    }).addText((text) => {
      text.inputEl.type = "date";
      text.setValue(this.draft.openingDate).onChange((value) => {
        this.draft.openingDate = value;
      });
    });
    new import_obsidian16.Setting(contentEl).setName("Statement balance").setDesc(
      "Optional. The figure on your last statement; the Accounts tab shows how far the derived balance has drifted from it."
    ).addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.inputMode = "decimal";
      text.setPlaceholder("none").setValue(this.draft.referenceBalance).onChange((value) => {
        this.draft.referenceBalance = value;
        clearProblem();
      });
    });
    new import_obsidian16.Setting(contentEl).setName("In use").setDesc("A closed account keeps its transactions but leaves the Accounts tab.").addToggle(
      (toggle) => toggle.setValue(this.draft.active).onChange((value) => {
        this.draft.active = value;
      })
    );
    new import_obsidian16.Setting(contentEl).setName("Count towards net worth").addToggle(
      (toggle) => toggle.setValue(this.draft.includeInNetWorth).onChange((value) => {
        this.draft.includeInNetWorth = value;
      })
    );
    const actions = contentEl.createDiv({ cls: "fin-sheet-actions" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const save = actions.createEl("button", {
      cls: "mod-cta",
      text: this.account ? "Save" : "Create"
    });
    save.addEventListener("click", () => {
      if (this.saving) return;
      const reason = this.problemWith();
      if (reason) {
        problem.setText(reason);
        problem.removeClass("is-hidden");
        return;
      }
      this.saving = true;
      save.disabled = true;
      void this.save().finally(() => {
        this.saving = false;
        save.disabled = false;
      });
    });
  }
  /** The reason the form cannot be saved, or null when it can. */
  problemWith() {
    const taken = this.plugin.index.accounts().map((account) => account.name);
    const nameProblem = noteNameProblem(this.draft.name, taken, this.account?.name ?? "", "account");
    if (nameProblem) return nameProblem;
    if (this.number(this.draft.openingBalance) === null) {
      return "The starting balance is not a number.";
    }
    if (this.draft.referenceBalance.trim() && this.number(this.draft.referenceBalance) === null) {
      return "The statement balance is not a number.";
    }
    return null;
  }
  number(raw) {
    const text = String(raw ?? "").trim();
    if (!text) return 0;
    const parsed = Number(text.replaceAll(",", ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  async save() {
    const name = this.draft.name.trim();
    const changes = {
      currency: this.draft.currency.trim().toUpperCase() || "EGP",
      account_type: this.draft.accountType || "bank",
      institution: this.draft.institution.trim(),
      card_endings: toList(this.draft.cardEndings),
      aliases: toList(this.draft.aliases),
      opening_balance: this.number(this.draft.openingBalance) ?? 0,
      opening_date: this.draft.openingDate.trim() || null,
      active: this.draft.active,
      include_in_net_worth: this.draft.includeInNetWorth
    };
    const reference = this.draft.referenceBalance.trim() ? this.number(this.draft.referenceBalance) : null;
    changes.balance = reference;
    if (reference === null) changes.balance_updated_at = null;
    else if (reference !== this.account?.referenceBalance) changes.balance_updated_at = cairoNow();
    try {
      if (!this.account) {
        const path2 = await createAccountNote(this.app, {
          name,
          currency: changes.currency ?? "EGP",
          accountType: changes.account_type ?? "bank",
          institution: changes.institution ?? "",
          cardEndings: changes.card_endings ?? [],
          aliases: changes.aliases ?? [],
          openingBalance: changes.opening_balance ?? 0,
          openingDate: changes.opening_date ?? "",
          referenceBalance: reference,
          active: this.draft.active,
          includeInNetWorth: this.draft.includeInNetWorth
        });
        if (changes.balance_updated_at) {
          await updateAccountNote(this.app, path2, {
            balance_updated_at: changes.balance_updated_at
          });
        }
        this.plugin.index.refreshPath(path2);
        new import_obsidian16.Notice(`Added ${name}.`);
        this.close();
        return;
      }
      const from = this.account.name;
      let path = this.account.path;
      let refiled = 0;
      if (name !== from) {
        path = await renameAccountNote(this.app, path, name);
        refiled = await this.plugin.renameAccountReferences(from, name);
      }
      await updateAccountNote(this.app, path, changes);
      this.plugin.index.refreshPath(path);
      new import_obsidian16.Notice(
        name === from ? `Saved ${name}.` : `Renamed ${from} to ${name} and re-filed ${refiled} transaction${refiled === 1 ? "" : "s"}.`,
        6e3
      );
      this.close();
    } catch (error) {
      new import_obsidian16.Notice(`Could not save the account: ${error.message}`, 1e4);
    }
  }
};

// src/ui/tabs/accounts-tab.ts
var TYPE_ICONS = {
  bank: "landmark",
  card: "credit-card",
  wallet: "wallet",
  cash: "banknote"
};
var AccountsTab = class {
  constructor(plugin) {
    this.plugin = plugin;
  }
  render(container) {
    const accounts = this.plugin.index.accounts();
    const allRecords = this.plugin.index.transactions();
    if (!accounts.length) {
      renderEmptyState(
        container,
        "wallet",
        "No accounts yet",
        "An account is a note under Budget/Accounts/ holding its card endings and its starting balance. Add the first one below."
      );
      this.renderNewButton(container);
      return;
    }
    const balances = deriveBalances(accounts, allRecords);
    const inPeriod = applyFilter(allRecords, { ...this.plugin.store.get(), excluded: "hide" }, cairoToday());
    const periodBalances = new Map(
      deriveBalances(accounts, inPeriod).map((item) => [item.account.path, item])
    );
    const netWorth = netWorthByCurrency(balances);
    if (netWorth.size) {
      const header = container.createDiv({ cls: "fin-networth" });
      header.createDiv({ cls: "fin-networth-label", text: "Net worth" });
      for (const [currency, value] of [...netWorth].sort()) {
        const row = header.createDiv({ cls: "fin-networth-row" });
        row.createSpan({
          cls: `fin-networth-value fin-amount ${value < 0 ? "fin-out" : ""}`,
          text: formatSignedAmount(value)
        });
        row.createSpan({ cls: "fin-networth-currency", text: currency });
      }
    }
    const list = container.createDiv({ cls: "fin-account-list" });
    for (const item of [...balances].sort((a, b) => b.balance - a.balance)) {
      const card = list.createDiv({ cls: "fin-account-card" });
      const head = card.createDiv({ cls: "fin-account-head" });
      const icon = head.createDiv({ cls: "fin-account-icon" });
      (0, import_obsidian17.setIcon)(icon, TYPE_ICONS[item.account.accountType] ?? "wallet");
      const names = head.createDiv({ cls: "fin-account-names" });
      names.createDiv({ cls: "fin-account-name", text: item.account.name });
      names.createDiv({
        cls: "fin-account-type",
        text: [
          item.account.institution,
          item.account.accountType,
          item.account.cardEndings.length ? `\xB7\xB7${item.account.cardEndings[0]}` : ""
        ].filter(Boolean).join(" \xB7 ")
      });
      const amount = head.createDiv({ cls: "fin-account-amount" });
      amount.createDiv({
        cls: `fin-amount fin-account-balance ${item.balance < 0 ? "fin-out" : ""}`,
        text: formatSignedAmount(item.balance)
      });
      amount.createDiv({ cls: "fin-account-currency", text: item.account.currency });
      this.renderEditButton(head, item.account);
      const period = periodBalances.get(item.account.path);
      if (period) {
        const flow = card.createDiv({ cls: "fin-account-flow" });
        flow.createSpan({ cls: "fin-in fin-amount", text: `+${formatAmount(period.moneyIn)}` });
        flow.createSpan({ cls: "fin-out fin-amount", text: `\u2212${formatAmount(period.moneyOut)}` });
        flow.createSpan({
          cls: "fin-account-count",
          text: `${period.transactionCount} this period`
        });
      }
      if (item.drift !== null && Math.abs(item.drift) > 5e-3) {
        const drift = card.createDiv({ cls: "fin-account-drift" });
        drift.setText(
          `Statement is ${formatAmount(item.drift)} ${item.account.currency} ${item.drift > 0 ? "higher" : "lower"} than these transactions` + (item.account.referenceUpdatedAt ? ` (as of ${item.account.referenceUpdatedAt.slice(0, 10)})` : "")
        );
      }
      card.addEventListener("click", () => {
        this.plugin.store.set({ accounts: [item.account.name] });
        this.plugin.showTransactionsTab();
      });
    }
    this.renderNewButton(container);
    const unknown = unknownAccountNames(accounts, allRecords);
    if (unknown.length) {
      const box = container.createDiv({ cls: "fin-unknown" });
      box.createEl("strong", { text: "Transactions reference accounts that are not set up:" });
      const names = box.createDiv({ cls: "fin-unknown-names" });
      for (const name of unknown) {
        const button = names.createEl("button", { cls: "fin-chip", text: `Set up ${name}` });
        button.addEventListener("click", () => {
          new AccountEditorModal(this.plugin.app, this.plugin, null, name).open();
        });
      }
      box.createEl("p", {
        cls: "fin-sheet-note",
        text: "Until an account exists under that name, its transactions move no balance."
      });
    }
  }
  /**
   * Editing sits on the card rather than behind it: tapping the card asks what
   * an account spent, which is the common question, so changing what the
   * account *is* needs its own target.
   */
  renderEditButton(head, account) {
    const edit = head.createEl("button", {
      cls: "clickable-icon fin-account-edit",
      attr: { "aria-label": `Edit ${account.name}` }
    });
    (0, import_obsidian17.setIcon)(edit, "pencil");
    edit.addEventListener("click", (event) => {
      event.stopPropagation();
      new AccountEditorModal(this.plugin.app, this.plugin, account).open();
    });
  }
  renderNewButton(container) {
    const actions = container.createDiv({ cls: "fin-account-actions" });
    const add = actions.createEl("button", { cls: "fin-more", text: "New account" });
    add.addEventListener("click", () => {
      new AccountEditorModal(this.plugin.app, this.plugin, null).open();
    });
  }
};

// src/ui/tabs/merchants-tab.ts
var import_obsidian19 = require("obsidian");

// src/data/category-rules.ts
async function loadCategoryRules(app) {
  return loadVaultJson(app, CATEGORY_RULES_PATH, { rules: [] });
}
async function saveCategoryRules(app, rules) {
  await saveVaultJson(app, CATEGORY_RULES_PATH, { rules: rules.rules ?? [] });
}

// src/ui/components/category-editor.ts
var import_obsidian18 = require("obsidian");
var FALLBACK_CATEGORY = "Uncategorized";
var CategoryNameModal = class extends import_obsidian18.Modal {
  constructor(app, prompt) {
    super(app);
    this.prompt = prompt;
    this.value = prompt.value;
  }
  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass("fin-sheet");
    contentEl.empty();
    contentEl.createEl("h2", { text: this.prompt.title });
    const problem = contentEl.createEl("p", { cls: "fin-rule-error-text is-hidden" });
    const submit = async () => {
      const name = this.value.trim();
      const reason = categoryNameProblem(name, this.prompt.taken, this.prompt.current ?? "");
      if (reason) {
        problem.setText(reason);
        problem.removeClass("is-hidden");
        return;
      }
      this.close();
      await this.prompt.onSubmit(name);
    };
    new import_obsidian18.Setting(contentEl).setName("Name").setDesc("This is the name on the note and on every transaction filed here.").addText((text) => {
      text.setPlaceholder("Groceries").setValue(this.value);
      text.onChange((value) => {
        this.value = value;
        problem.addClass("is-hidden");
      });
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") void submit();
      });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });
    const actions = contentEl.createDiv({ cls: "fin-sheet-actions" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const save = actions.createEl("button", { cls: "mod-cta", text: this.prompt.submit });
    save.addEventListener("click", () => void submit());
  }
};
var DeleteCategoryModal = class extends import_obsidian18.Modal {
  constructor(app, prompt) {
    super(app);
    this.prompt = prompt;
    this.destination = prompt.others.includes(FALLBACK_CATEGORY) ? FALLBACK_CATEGORY : prompt.others[0] ?? FALLBACK_CATEGORY;
  }
  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass("fin-sheet");
    contentEl.empty();
    contentEl.createEl("h2", { text: `Delete ${this.prompt.category.name}?` });
    contentEl.createEl("p", {
      cls: "fin-sheet-note",
      text: "The note goes to the trash. Nothing is removed from your transactions."
    });
    if (this.prompt.held) {
      new import_obsidian18.Setting(contentEl).setName(`Move ${this.prompt.held} transaction${this.prompt.held === 1 ? "" : "s"} to`).addDropdown((dropdown) => {
        const options = this.prompt.others.includes(FALLBACK_CATEGORY) ? this.prompt.others : [FALLBACK_CATEGORY, ...this.prompt.others];
        for (const name of options) dropdown.addOption(name, name);
        dropdown.setValue(this.destination);
        dropdown.onChange((value) => {
          this.destination = value;
        });
      });
    }
    const actions = contentEl.createDiv({ cls: "fin-sheet-actions" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const confirm = actions.createEl("button", { cls: "mod-warning", text: "Delete" });
    confirm.addEventListener("click", () => {
      this.close();
      void this.prompt.onConfirm(this.destination);
    });
  }
};

// src/ui/tabs/merchants-tab.ts
var SORTS = [
  { id: "total", label: "Amount" },
  { id: "count", label: "Times" },
  { id: "recent", label: "Recent" },
  { id: "name", label: "Name" }
];
var PAGE_SIZE2 = 60;
var NEW_CATEGORY = "/new";
function compare(sort) {
  if (sort === "count") return (a, b) => b.count - a.count || a.name.localeCompare(b.name);
  if (sort === "name") return (a, b) => a.name.localeCompare(b.name);
  if (sort === "recent") {
    return (a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? "") || a.name.localeCompare(b.name);
  }
  return (a, b) => b.spent + b.received - (a.spent + a.received) || a.name.localeCompare(b.name);
}
var MerchantsTab = class {
  constructor(plugin) {
    this.plugin = plugin;
    this.sort = "total";
    this.uncategorizedOnly = false;
    this.shown = PAGE_SIZE2;
  }
  resetPaging() {
    this.shown = PAGE_SIZE2;
  }
  render(container) {
    const filter = this.plugin.store.get();
    const records = applyFilter(this.plugin.index.transactions(), filter, cairoToday());
    const all = counterpartySummary(records);
    const unnamed = records.filter(
      (record) => !record.counterparty && record.smsMessage
    ).length;
    if (!all.length) {
      renderEmptyState(
        container,
        "store",
        "No names yet",
        records.length ? "None of these transactions name anyone yet. Try reading the stored messages again, widen the period, or add your bank's wording to merchant_patterns in Budget/Settings/sms_patterns.json." : "No transactions match these filters. Try a different period."
      );
      if (unnamed) this.renderFillButton(container, unnamed);
      return;
    }
    const rows = all.filter((item) => !this.uncategorizedOnly || item.categories.includes("Uncategorized")).sort(compare(this.sort));
    this.renderToolbar(container, all, unnamed);
    if (!rows.length) {
      renderEmptyState(
        container,
        "check",
        "Everything is categorised",
        `All ${all.length} names in ${periodLabel(filter.period)} have a category.`
      );
      return;
    }
    const categories = new Map(this.plugin.index.categories().map((entry) => [entry.name, entry]));
    const list = container.createDiv({ cls: "fin-merchant-list" });
    for (const item of rows.slice(0, this.shown)) this.renderRow(list, item, categories);
    if (rows.length > this.shown) {
      const more = list.createEl("button", {
        cls: "fin-more",
        text: `Show ${Math.min(PAGE_SIZE2, rows.length - this.shown)} more of ${rows.length}`
      });
      more.addEventListener("click", () => {
        this.shown += PAGE_SIZE2;
        this.plugin.refreshBudgetView();
      });
    }
  }
  renderToolbar(container, all, unnamed) {
    const bar = container.createDiv({ cls: "fin-merchant-bar" });
    const pending = all.filter((item) => item.categories.includes("Uncategorized")).length;
    bar.createSpan({
      cls: "fin-merchant-count",
      text: `${all.length} name${all.length === 1 ? "" : "s"}` + (pending ? ` \xB7 ${pending} to categorise` : "")
    });
    const sorts = bar.createDiv({ cls: "fin-merchant-sorts" });
    for (const option of SORTS) {
      const button = sorts.createEl("button", { cls: "fin-chip", text: option.label });
      button.toggleClass("is-active", this.sort === option.id);
      button.addEventListener("click", () => {
        this.sort = option.id;
        this.resetPaging();
        this.plugin.refreshBudgetView();
      });
    }
    const toggle = bar.createEl("button", { cls: "fin-chip", text: "Needs a category" });
    toggle.toggleClass("is-active", this.uncategorizedOnly);
    toggle.addEventListener("click", () => {
      this.uncategorizedOnly = !this.uncategorizedOnly;
      this.resetPaging();
      this.plugin.refreshBudgetView();
    });
    if (unnamed > 0) this.renderFillButton(bar, unnamed);
  }
  /**
   * A transaction parsed before the patterns knew its wording keeps an empty
   * party key, because a note that reached `parsed` is never parsed again. This
   * is the way back for those, offered where their absence shows.
   */
  renderFillButton(container, unnamed) {
    const wrapper = container.createDiv({ cls: "fin-merchant-unnamed" });
    wrapper.createSpan({
      text: `${unnamed} transaction${unnamed === 1 ? "" : "s"} with a message name nobody. `
    });
    const button = wrapper.createEl("button", {
      cls: "fin-chip",
      text: "Read their messages again"
    });
    button.addEventListener("click", () => {
      button.disabled = true;
      void this.plugin.fillMissingCounterparties().then((filled) => {
        new import_obsidian19.Notice(`Named the other side of ${filled} transaction(s).`, 6e3);
      }).catch((error) => {
        new import_obsidian19.Notice(`Could not read the messages: ${error.message}`, 1e4);
      }).finally(() => {
        button.disabled = false;
      });
    });
  }
  renderRow(list, item, categories) {
    const row = list.createDiv({ cls: "fin-merchant-row" });
    row.toggleClass("is-pending", item.categories.includes("Uncategorized"));
    const head = row.createDiv({ cls: "fin-merchant-head" });
    const name = head.createDiv({ cls: "fin-merchant-name", text: item.name });
    name.setAttribute("role", "button");
    name.setAttribute("aria-label", `Show the transactions of ${item.name}`);
    name.addEventListener("click", () => {
      this.plugin.store.set({ search: item.name });
      this.plugin.showTransactionsTab();
    });
    const amounts = head.createDiv({ cls: "fin-merchant-amounts" });
    if (item.spent) {
      amounts.createSpan({ cls: "fin-out fin-amount", text: `\u2212${formatAmount(item.spent)}` });
    }
    if (item.received) {
      amounts.createSpan({ cls: "fin-in fin-amount", text: `+${formatAmount(item.received)}` });
    }
    if (item.currency) amounts.createSpan({ cls: "fin-merchant-currency", text: item.currency });
    const meta = row.createDiv({ cls: "fin-merchant-meta" });
    meta.createSpan({
      text: [
        item.roles.map((role) => ROLE_LABELS[role]).join(" \xB7 ") || ROLE_LABELS[""],
        `${item.count} transaction${item.count === 1 ? "" : "s"}`,
        item.lastDate ? `last ${item.lastDate}` : ""
      ].filter(Boolean).join(" \xB7 ")
    });
    if (item.categories.length > 1) {
      const chips = row.createDiv({ cls: "fin-merchant-chips" });
      for (const category of item.categories) {
        const chip = chips.createSpan({ cls: "fin-merchant-chip", text: category });
        chip.style.setProperty("--fin-cat-color", categoryColor(category, categories));
      }
    }
    const options = [...categories.keys()].sort((a, b) => a.localeCompare(b));
    const select = row.createEl("select", { cls: "fin-merchant-select dropdown" });
    select.setAttribute("aria-label", `Category for ${item.name}`);
    const placeholder = item.categories.length > 1 ? "Mixed \u2014 choose one" : "Choose a category";
    select.createEl("option", { value: "", text: placeholder });
    for (const category of options.length ? options : ["Uncategorized"]) {
      select.createEl("option", { value: category, text: category });
    }
    select.value = item.category && item.category !== "Uncategorized" ? item.category : "";
    select.createEl("option", { value: NEW_CATEGORY, text: "New category\u2026" });
    select.addEventListener("change", () => {
      const chosen = select.value;
      if (!chosen) return;
      if (chosen === NEW_CATEGORY) {
        select.value = "";
        this.promptForCategory(item, [...categories.keys()]);
        return;
      }
      select.disabled = true;
      void this.assign(item, chosen).finally(() => {
        select.disabled = false;
      });
    });
    const open = row.createEl("button", {
      cls: "fin-merchant-open",
      attr: { "aria-label": `Show the transactions of ${item.name}` }
    });
    (0, import_obsidian19.setIcon)(open, "chevron-right");
    open.addEventListener("click", () => {
      this.plugin.store.set({ search: item.name });
      this.plugin.showTransactionsTab();
    });
  }
  /**
   * Naming a category you do not have yet is the common case here: the list is
   * where you find out you need one. Creating it files the party in the same
   * step, so the answer you had in mind lands without a detour through the
   * category editor.
   */
  promptForCategory(item, taken) {
    new CategoryNameModal(this.plugin.app, {
      title: `New category for ${item.name}`,
      submit: "Create and file",
      value: "",
      taken,
      onSubmit: async (name) => {
        try {
          await this.plugin.createCategory(name);
        } catch (error) {
          new import_obsidian19.Notice(`Could not create the category: ${error.message}`, 1e4);
          return;
        }
        await this.assign(item, name);
      }
    }).open();
  }
  /**
   * Files every transaction of one party and teaches the parser the name, in
   * that order: the notes are the record, and the rule only affects what has
   * not arrived yet. A failure part-way through still reports what it managed.
   */
  async assign(item, category) {
    let filed = 0;
    try {
      for (const path of item.paths) {
        await setCategory(this.plugin.app, path, category);
        filed += 1;
      }
      const rules = await loadCategoryRules(this.plugin.app);
      await saveCategoryRules(this.plugin.app, withKeyword(rules, category, item.name));
      new import_obsidian19.Notice(
        `Filed ${filed} transaction${filed === 1 ? "" : "s"} of ${item.name} under ${category}, and future messages that mention it too.`,
        6e3
      );
    } catch (error) {
      new import_obsidian19.Notice(
        `Filed ${filed} of ${item.paths.length} transactions before failing: ${error.message}`,
        1e4
      );
    }
  }
};

// src/ui/tabs/categories-tab.ts
var import_obsidian20 = require("obsidian");
var SORTS2 = [
  { id: "total", label: "Amount" },
  { id: "count", label: "Times" },
  { id: "recent", label: "Recent" },
  { id: "name", label: "Name" }
];
var ICON_CHOICES = [
  "shopping-cart",
  "utensils",
  "car",
  "receipt",
  "shopping-bag",
  "heart-pulse",
  "trending-up",
  "percent",
  "arrow-left-right",
  "home",
  "plane",
  "gift",
  "smartphone",
  "graduation-cap",
  "dumbbell",
  "circle-dashed"
];
var FALLBACK_CATEGORY2 = "Uncategorized";
function compare2(sort) {
  const spend = (row) => row.totals ? row.totals.spent + row.totals.received : 0;
  if (sort === "count") {
    return (a, b) => (b.totals?.count ?? 0) - (a.totals?.count ?? 0) || a.name.localeCompare(b.name);
  }
  if (sort === "name") return (a, b) => a.name.localeCompare(b.name);
  if (sort === "recent") {
    return (a, b) => (b.totals?.lastDate ?? "").localeCompare(a.totals?.lastDate ?? "") || a.name.localeCompare(b.name);
  }
  return (a, b) => spend(b) - spend(a) || a.name.localeCompare(b.name);
}
var CategoriesTab = class {
  constructor(plugin) {
    this.plugin = plugin;
    this.sort = "total";
    this.overBudgetOnly = false;
    /** The names whose editor is open, kept across the redraws a save triggers. */
    this.expanded = /* @__PURE__ */ new Set();
    this.rules = { rules: [] };
    this.rulesError = null;
    this.rulesLoaded = false;
  }
  render(container) {
    if (!this.rulesLoaded) void this.loadRules();
    const filter = this.plugin.store.get();
    const records = applyFilter(this.plugin.index.transactions(), filter, cairoToday());
    const rows = this.rows(records);
    if (!rows.length) {
      renderEmptyState(
        container,
        "tag",
        "No categories yet",
        "A category is a note under Budget/Settings/Categories/. Add the first one below and every transaction filed under it will find it."
      );
      this.renderNewButton(container.createDiv({ cls: "fin-category-bar" }));
      return;
    }
    const shown = rows.filter((row) => !this.overBudgetOnly || this.overBudget(row)).sort(compare2(this.sort));
    this.renderToolbar(container, rows);
    if (this.rulesError) {
      const problem = container.createDiv({ cls: "fin-rule-error" });
      problem.createEl("strong", { text: "The keyword rules could not be read:" });
      problem.createEl("pre", { text: this.rulesError });
      problem.createEl("p", {
        text: "Fix Budget/Settings/Categories/rules.json, then reopen the Budget view. Colours and budgets can still be changed; keywords cannot, because saving them would discard the rules that failed to load."
      });
    }
    if (!shown.length) {
      renderEmptyState(
        container,
        "check",
        "Nothing is over budget",
        `Every budgeted category is within its budget in ${periodLabel(filter.period)}.`
      );
      return;
    }
    const notes = new Map(this.plugin.index.categories().map((entry) => [entry.name, entry]));
    const list = container.createDiv({ cls: "fin-category-list" });
    for (const row of shown) this.renderRow(list, row, notes);
  }
  /** The categories the period spent against, plus every category note there is. */
  rows(records) {
    const byName = /* @__PURE__ */ new Map();
    for (const totals of categorySummary(records)) {
      byName.set(totals.name, { name: totals.name, totals, note: null });
    }
    for (const note of this.plugin.index.categories()) {
      const existing = byName.get(note.name);
      if (existing) existing.note = note;
      else byName.set(note.name, { name: note.name, totals: null, note });
    }
    return [...byName.values()];
  }
  async loadRules() {
    this.rulesLoaded = true;
    try {
      this.rules = await loadCategoryRules(this.plugin.app);
    } catch (error) {
      this.rulesError = error.message;
    }
    this.plugin.refreshBudgetView();
  }
  budget(row) {
    return row.note?.monthlyBudget ?? null;
  }
  overBudget(row) {
    const budget = this.budget(row);
    return budget !== null && budget > 0 && (row.totals?.spent ?? 0) > budget;
  }
  renderToolbar(container, rows) {
    const bar = container.createDiv({ cls: "fin-category-bar" });
    const over = rows.filter((row) => this.overBudget(row)).length;
    const unnoted = rows.filter((row) => !row.note).length;
    bar.createSpan({
      cls: "fin-category-bar-count",
      text: `${rows.length} categor${rows.length === 1 ? "y" : "ies"}` + (over ? ` \xB7 ${over} over budget` : "") + (unnoted ? ` \xB7 ${unnoted} without a note` : "")
    });
    const sorts = bar.createDiv({ cls: "fin-category-sorts" });
    for (const option of SORTS2) {
      const button = sorts.createEl("button", { cls: "fin-chip", text: option.label });
      button.toggleClass("is-active", this.sort === option.id);
      button.addEventListener("click", () => {
        this.sort = option.id;
        this.plugin.refreshBudgetView();
      });
    }
    const toggle = bar.createEl("button", { cls: "fin-chip", text: "Over budget" });
    toggle.toggleClass("is-active", this.overBudgetOnly);
    toggle.addEventListener("click", () => {
      this.overBudgetOnly = !this.overBudgetOnly;
      this.plugin.refreshBudgetView();
    });
    this.renderNewButton(bar);
  }
  renderNewButton(container) {
    const add = container.createEl("button", { cls: "fin-chip mod-cta", text: "New category" });
    add.addEventListener("click", () => {
      new CategoryNameModal(this.plugin.app, {
        title: "New category",
        submit: "Create",
        value: "",
        taken: this.plugin.index.categories().map((entry) => entry.name),
        onSubmit: async (name) => {
          try {
            await this.plugin.createCategory(name);
            new import_obsidian20.Notice(`Added ${name}.`);
          } catch (error) {
            new import_obsidian20.Notice(`Could not create the category: ${error.message}`, 1e4);
          }
        }
      }).open();
    });
  }
  renderRow(list, row, map) {
    const color = categoryColor(row.name, map);
    const container = list.createDiv({ cls: "fin-category-row" });
    container.toggleClass("is-over", this.overBudget(row));
    const glyph = container.createDiv({ cls: "fin-category-glyph" });
    const paintGlyph = (fill, icon) => {
      glyph.empty();
      glyph.style.setProperty("--fin-cat-color", fill);
      (0, import_obsidian20.setIcon)(glyph, icon);
    };
    paintGlyph(color, categoryIcon(row.name, map));
    const body = container.createDiv({ cls: "fin-category-body" });
    const head = body.createDiv({ cls: "fin-category-head" });
    const name = head.createDiv({ cls: "fin-category-name", text: row.name });
    name.setAttribute("role", "button");
    name.setAttribute("aria-label", `Show the transactions filed under ${row.name}`);
    name.addEventListener("click", () => {
      this.plugin.store.set({ categories: [row.name] });
      this.plugin.showTransactionsTab();
    });
    const amounts = head.createDiv({ cls: "fin-category-amounts" });
    if (row.totals?.spent) {
      amounts.createSpan({ cls: "fin-out fin-amount", text: `\u2212${formatAmount(row.totals.spent)}` });
    }
    if (row.totals?.received) {
      amounts.createSpan({ cls: "fin-in fin-amount", text: `+${formatAmount(row.totals.received)}` });
    }
    if (row.totals?.currency) {
      amounts.createSpan({ cls: "fin-category-currency", text: row.totals.currency });
    }
    const budget = this.budget(row);
    const spent = row.totals?.spent ?? 0;
    body.createDiv({
      cls: "fin-category-meta",
      text: [
        row.totals ? `${row.totals.count} transaction${row.totals.count === 1 ? "" : "s"}` : "Nothing this period",
        row.totals?.lastDate ? `last ${row.totals.lastDate}` : "",
        budget === null ? "" : spent > budget ? `${formatAmount(spent - budget)} over a ${formatAmount(budget)} budget` : `${formatAmount(budget - spent)} left of ${formatAmount(budget)}`,
        row.note ? "" : "no note yet"
      ].filter(Boolean).join(" \xB7 ")
    });
    if (budget !== null && budget > 0) {
      const track = body.createDiv({ cls: "fin-hbar-track" });
      const fill = track.createDiv({ cls: "fin-hbar-fill" });
      fill.style.width = `${Math.min(spent / budget, 1) * 100}%`;
      fill.style.background = spent > budget ? "var(--fin-over)" : color;
      track.toggleClass("is-over", spent > budget);
    }
    this.renderTools(body, row);
    if (row.note && this.expanded.has(row.name)) this.renderEditor(body, row.note, map, paintGlyph);
  }
  /**
   * A category with a note can be edited, renamed and deleted; one that exists
   * only because transactions name it gets the note written first, since there
   * is nowhere to keep a colour or a budget until then.
   */
  renderTools(body, row) {
    const tools = body.createDiv({ cls: "fin-category-actions" });
    if (!row.note) {
      const create = tools.createEl("button", { cls: "fin-chip", text: "Create its note" });
      create.addEventListener("click", async () => {
        create.disabled = true;
        try {
          await this.plugin.createCategory(row.name);
          this.expanded.add(row.name);
          new import_obsidian20.Notice(`Added ${row.name}.`);
        } catch (error) {
          new import_obsidian20.Notice(`Could not create the category: ${error.message}`, 1e4);
          create.disabled = false;
        }
      });
      return;
    }
    const note = row.note;
    const open = this.expanded.has(row.name);
    const edit = tools.createEl("button", {
      cls: "fin-chip",
      text: open ? "Done" : "Edit",
      attr: { "aria-expanded": String(open) }
    });
    edit.toggleClass("is-active", open);
    edit.addEventListener("click", () => {
      if (open) this.expanded.delete(row.name);
      else this.expanded.add(row.name);
      this.plugin.refreshBudgetView();
    });
    const rename = tools.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": `Rename ${row.name}` }
    });
    (0, import_obsidian20.setIcon)(rename, "pencil");
    rename.addEventListener("click", () => {
      new CategoryNameModal(this.plugin.app, {
        title: `Rename ${row.name}`,
        submit: "Rename",
        value: row.name,
        taken: this.plugin.index.categories().map((entry) => entry.name),
        current: row.name,
        onSubmit: (wanted) => this.rename(note, wanted)
      }).open();
    });
    const remove = tools.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": `Delete ${row.name}` }
    });
    (0, import_obsidian20.setIcon)(remove, "trash");
    remove.addEventListener("click", () => {
      new DeleteCategoryModal(this.plugin.app, {
        category: note,
        held: this.heldBy(note.name),
        others: this.plugin.index.categories().map((entry) => entry.name).filter((other) => other !== note.name).sort((a, b) => a.localeCompare(b)),
        onConfirm: (destination) => this.remove(note, destination)
      }).open();
    });
  }
  /** How many transactions a category holds, across the whole vault. */
  heldBy(name) {
    return this.plugin.index.transactions().filter((record) => record.category === name).length;
  }
  renderEditor(body, category, map, paintGlyph) {
    const editor = body.createDiv({ cls: "fin-category-editor" });
    const swatches = editor.createDiv({ cls: "fin-swatches" });
    for (const color of CATEGORY_PALETTE) {
      const swatch = swatches.createEl("button", {
        cls: "fin-swatch",
        attr: { "aria-label": `Colour ${color}` }
      });
      swatch.style.background = color;
      swatch.toggleClass("is-active", category.color === color);
      swatch.addEventListener("click", async () => {
        try {
          await updateCategoryNote(this.plugin.app, category.path, { color });
          category.color = color;
          swatches.querySelectorAll(".fin-swatch").forEach((other) => other.removeClass("is-active"));
          swatch.addClass("is-active");
          paintGlyph(color, categoryIcon(category.name, map));
        } catch (error) {
          new import_obsidian20.Notice(`Could not save the colour: ${error.message}`);
        }
      });
    }
    new import_obsidian20.Setting(editor).setName("Icon").addDropdown((dropdown) => {
      for (const icon of ICON_CHOICES) dropdown.addOption(icon, icon);
      dropdown.setValue(category.icon ?? categoryIcon(category.name, map));
      dropdown.onChange(async (value) => {
        try {
          await updateCategoryNote(this.plugin.app, category.path, { icon: value });
          category.icon = value;
          paintGlyph(categoryColor(category.name, map), value);
        } catch (error) {
          new import_obsidian20.Notice(`Could not save the icon: ${error.message}`);
        }
      });
    });
    new import_obsidian20.Setting(editor).setName("Monthly budget").setDesc(category.currency).addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.inputMode = "decimal";
      text.setPlaceholder("none");
      text.setValue(category.monthlyBudget === null ? "" : String(category.monthlyBudget));
      text.inputEl.addEventListener("change", async () => {
        const raw = text.inputEl.value.trim();
        const parsed = raw === "" ? null : Number(raw.replaceAll(",", ""));
        if (parsed !== null && !Number.isFinite(parsed)) {
          new import_obsidian20.Notice("That budget is not a number.");
          return;
        }
        try {
          await updateCategoryNote(this.plugin.app, category.path, { monthly_budget: parsed });
          category.monthlyBudget = parsed;
        } catch (error) {
          new import_obsidian20.Notice(`Could not save the budget: ${error.message}`);
        }
      });
    });
    if (!this.rulesError) this.renderKeywords(editor, category);
  }
  /**
   * The words that file a message here on their own. This is the same list the
   * Merchants tab writes to a name at a time, opened up so a phrase no merchant
   * is named after can be added by hand.
   */
  renderKeywords(editor, category) {
    const folded = category.name.trim().toLocaleLowerCase();
    const current = this.rules.rules.find(
      (rule) => String(rule.category).trim().toLocaleLowerCase() === folded
    );
    new import_obsidian20.Setting(editor).setName("Keywords").setDesc("Separated by commas. A message containing one of them files itself here.").addTextArea((area) => {
      area.inputEl.addClass("fin-keyword-input");
      area.inputEl.rows = 2;
      area.setPlaceholder("carrefour, seoudi");
      area.setValue((current?.keywords ?? []).join(", "));
      area.inputEl.addEventListener("change", async () => {
        const next = withKeywords(this.rules, category.name, area.inputEl.value.split(","));
        try {
          await saveCategoryRules(this.plugin.app, next);
          this.rules = next;
          this.plugin.refreshBudgetView();
        } catch (error) {
          new import_obsidian20.Notice(`Could not save the keywords: ${error.message}`);
        }
      });
    });
  }
  /**
   * Renames the note first, so a name its file cannot take fails before
   * anything moves, then re-files the transactions and the keyword rule behind
   * it. A failure part-way through still says how far it got.
   */
  async rename(category, name) {
    const from = category.name;
    let moved = 0;
    try {
      const path = await renameCategoryNote(this.plugin.app, category.path, name);
      moved = await this.plugin.recategorize(from, name);
      if (!this.rulesError) {
        const next = renamedCategory(this.rules, from, name);
        await saveCategoryRules(this.plugin.app, next);
        this.rules = next;
      }
      if (this.expanded.delete(from)) this.expanded.add(name);
      this.plugin.index.refreshPath(path);
      new import_obsidian20.Notice(
        `Renamed ${from} to ${name} and re-filed ${moved} transaction${moved === 1 ? "" : "s"}.`,
        6e3
      );
    } catch (error) {
      new import_obsidian20.Notice(
        `Renaming stopped after ${moved} transaction${moved === 1 ? "" : "s"}: ${error.message}`,
        1e4
      );
    }
  }
  /**
   * Moves the transactions before deleting the note, so nothing is left naming
   * a category that no longer exists even if the delete fails.
   *
   * The keywords follow the transactions to their new home, since a message
   * that used to belong here still belongs wherever these went. The exception
   * is Uncategorized, which is where a message lands when no keyword matches it
   * at all, so there the words are simply dropped.
   */
  async remove(category, destination) {
    let moved = 0;
    try {
      moved = await this.plugin.recategorize(category.name, destination);
      if (!this.rulesError) {
        const next = destination === FALLBACK_CATEGORY2 ? withoutCategory(this.rules, category.name) : renamedCategory(this.rules, category.name, destination);
        await saveCategoryRules(this.plugin.app, next);
        this.rules = next;
      }
      await deleteCategoryNote(this.plugin.app, category.path);
      this.expanded.delete(category.name);
      new import_obsidian20.Notice(
        `Deleted ${category.name}. ${moved} transaction${moved === 1 ? "" : "s"} moved to ${destination}.`,
        6e3
      );
    } catch (error) {
      new import_obsidian20.Notice(
        `Deleting stopped after moving ${moved} transaction${moved === 1 ? "" : "s"}: ${error.message}`,
        1e4
      );
    }
  }
};

// src/ui/tabs/stats-tab.ts
var import_obsidian21 = require("obsidian");

// src/domain/budgets.ts
var WARN_AT = 0.8;
function budgetProgress(categories, records) {
  const spendByCurrency = /* @__PURE__ */ new Map();
  const progress = [];
  for (const category of categories) {
    if (category.monthlyBudget === null || category.monthlyBudget <= 0) continue;
    if (!spendByCurrency.has(category.currency)) {
      const totals = new Map(
        spendByCategory(records, category.currency).map((item) => [item.category, item.amount])
      );
      spendByCurrency.set(category.currency, totals);
    }
    const spent = spendByCurrency.get(category.currency).get(category.name) ?? 0;
    const budget = category.monthlyBudget;
    const ratio = spent / budget;
    progress.push({
      category: category.name,
      currency: category.currency,
      budget,
      spent,
      remaining: budget - spent,
      ratio,
      level: ratio > 1 ? "over" : ratio >= WARN_AT ? "warn" : "ok"
    });
  }
  return progress.sort((a, b) => b.ratio - a.ratio || a.category.localeCompare(b.category));
}

// src/ui/components/panel.ts
function renderPanel(container, title, subtitle) {
  const panel = container.createDiv({ cls: "fin-panel" });
  const head = panel.createDiv({ cls: "fin-panel-head" });
  head.createEl("h3", { cls: "fin-panel-title", text: title });
  if (subtitle) head.createSpan({ cls: "fin-panel-subtitle", text: subtitle });
  return panel.createDiv({ cls: "fin-panel-body" });
}

// src/ui/charts/svg.ts
var SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    element.setAttribute(name, String(value));
  }
  return element;
}
function createChart(width, height, title) {
  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": title,
    preserveAspectRatio: "xMidYMid meet"
  });
  svg.appendChild(svgEl("title")).textContent = title;
  return svg;
}
function linearScale(domainMax, rangeMax) {
  if (domainMax <= 0) return () => 0;
  return (value) => value / domainMax * rangeMax;
}
function niceMax(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude2 = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude2;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude2;
}
function pointOnCircle(cx, cy, radius, angle) {
  return [cx + radius * Math.sin(angle), cy - radius * Math.cos(angle)];
}
function arcPath(cx, cy, radius, innerRadius, startAngle, endAngle) {
  const sweep = Math.min(endAngle - startAngle, Math.PI * 2 - 1e-4);
  const end = startAngle + sweep;
  const largeArc = sweep > Math.PI ? 1 : 0;
  const [outerStartX, outerStartY] = pointOnCircle(cx, cy, radius, startAngle);
  const [outerEndX, outerEndY] = pointOnCircle(cx, cy, radius, end);
  const [innerEndX, innerEndY] = pointOnCircle(cx, cy, innerRadius, end);
  const [innerStartX, innerStartY] = pointOnCircle(cx, cy, innerRadius, startAngle);
  return [
    `M ${outerStartX.toFixed(2)} ${outerStartY.toFixed(2)}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${outerEndX.toFixed(2)} ${outerEndY.toFixed(2)}`,
    `L ${innerEndX.toFixed(2)} ${innerEndY.toFixed(2)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStartX.toFixed(2)} ${innerStartY.toFixed(2)}`,
    "Z"
  ].join(" ");
}

// src/ui/charts/donut.ts
function renderDonut(container, data, options) {
  const positive = data.filter((item) => item.value > 0);
  if (!positive.length) {
    container.createEl("p", { cls: "fin-panel-empty", text: "Nothing to show for this period." });
    return;
  }
  const size = 200;
  const centre = size / 2;
  const radius = 88;
  const inner = 58;
  const total = positive.reduce((sum, item) => sum + item.value, 0);
  const svg = createChart(size, size, `Spending by category, total ${formatAmount(options.total)} ${options.currency}`);
  svg.addClass("fin-donut");
  let angle = 0;
  for (const item of positive) {
    const sweep = item.value / total * Math.PI * 2;
    const path = svgEl("path", {
      d: arcPath(centre, centre, radius, inner, angle, angle + sweep),
      fill: item.color
    });
    path.addClass("fin-donut-slice");
    const share = (item.value / total * 100).toFixed(1);
    svg.appendChild(path).appendChild(svgEl("title")).textContent = `${item.label}: ${formatAmount(item.value)} ${options.currency} (${share}%)`;
    if (options.onSelect) {
      path.addClass("is-clickable");
      path.addEventListener("click", () => options.onSelect(item.label));
    }
    angle += sweep;
  }
  const centreValue = svgEl("text", {
    x: centre,
    y: centre - 2,
    "text-anchor": "middle",
    "dominant-baseline": "middle"
  });
  centreValue.addClass("fin-donut-total");
  centreValue.textContent = formatAmount(options.total);
  svg.appendChild(centreValue);
  const centreLabel = svgEl("text", {
    x: centre,
    y: centre + 18,
    "text-anchor": "middle",
    "dominant-baseline": "middle"
  });
  centreLabel.addClass("fin-donut-currency");
  centreLabel.textContent = options.currency;
  svg.appendChild(centreLabel);
  container.appendChild(svg);
  const legend = container.createEl("ul", { cls: "fin-legend" });
  for (const item of positive) {
    const row = legend.createEl("li", { cls: "fin-legend-row" });
    const swatch = row.createSpan({ cls: "fin-legend-swatch" });
    swatch.style.background = item.color;
    row.createSpan({ cls: "fin-legend-label", text: item.label });
    row.createSpan({
      cls: "fin-legend-value fin-amount",
      text: `${formatAmount(item.value)} \xB7 ${(item.value / total * 100).toFixed(0)}%`
    });
    if (options.onSelect) {
      row.addClass("is-clickable");
      row.addEventListener("click", () => options.onSelect(item.label));
    }
  }
}

// src/ui/charts/bars.ts
function renderBars(container, data, options) {
  if (!data.length) {
    container.createEl("p", { cls: "fin-panel-empty", text: "Nothing to show for this period." });
    return;
  }
  const width = 320;
  const height = 140;
  const padBottom = 20;
  const plotHeight = height - padBottom;
  const max = niceMax(Math.max(...data.map((item) => item.value)));
  const scale = linearScale(max, plotHeight - 4);
  const slot = width / data.length;
  const barWidth = Math.max(2, Math.min(slot - 2, 22));
  const svg = createChart(width, height, `Spending over time, peak ${formatAmount(max)} ${options.currency}`);
  svg.addClass("fin-bars");
  const baseline = svgEl("line", { x1: 0, y1: plotHeight, x2: width, y2: plotHeight });
  baseline.addClass("fin-axis");
  svg.appendChild(baseline);
  data.forEach((item, index) => {
    const barHeight = scale(item.value);
    const x = index * slot + (slot - barWidth) / 2;
    const bar = svgEl("rect", {
      x: x.toFixed(2),
      y: (plotHeight - barHeight).toFixed(2),
      width: barWidth,
      height: Math.max(barHeight, item.value > 0 ? 1 : 0).toFixed(2),
      rx: 2
    });
    bar.addClass("fin-bar");
    if (options.highlightLast && index === data.length - 1) bar.addClass("is-current");
    svg.appendChild(bar).appendChild(svgEl("title")).textContent = `${item.sublabel ?? item.label}: ${formatAmount(item.value)} ${options.currency}`;
  });
  for (const index of /* @__PURE__ */ new Set([0, Math.floor(data.length / 2), data.length - 1])) {
    const label = svgEl("text", {
      x: (index * slot + slot / 2).toFixed(2),
      y: height - 6,
      "text-anchor": "middle"
    });
    label.addClass("fin-axis-label");
    label.textContent = data[index].label;
    svg.appendChild(label);
  }
  container.appendChild(svg);
  container.createEl("p", {
    cls: "fin-chart-caption",
    text: `Peak ${formatAmount(max)} ${options.currency} \xB7 ${data.length} buckets`
  });
}

// src/ui/tabs/stats-tab.ts
var SHORT_MONTHS2 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var StatsTab = class {
  constructor(plugin) {
    this.plugin = plugin;
  }
  render(container) {
    const today = cairoToday();
    const filter = this.plugin.store.get();
    const records = applyFilter(this.plugin.index.transactions(), filter, today);
    if (!records.length) {
      renderEmptyState(
        container,
        "bar-chart-3",
        "Nothing to chart",
        "No transactions match these filters. Try a different period."
      );
      return;
    }
    const grid = container.createDiv({ cls: "fin-panel-grid" });
    const currency = primaryCurrency(records);
    const label = periodLabel(filter.period);
    this.renderFlowPanel(grid, records, label);
    this.renderCategoryPanel(grid, records, currency, label);
    this.renderTrendPanel(grid, records, currency, today);
    this.renderBudgetPanel(grid, records, label);
    this.renderMerchantPanel(grid, records, currency);
    this.renderBalancePanel(grid);
    const actions = container.createDiv({ cls: "fin-stats-actions" });
    const exportButton = actions.createEl("button", { cls: "fin-more", text: "Export these transactions as CSV" });
    exportButton.addEventListener("click", async () => {
      try {
        const path = await exportCsv(this.plugin.app, records, periodLabel(filter.period));
        new import_obsidian21.Notice(`Exported ${records.length} transactions to ${path}.`);
      } catch (error) {
        new import_obsidian21.Notice(`Export failed: ${error.message}`);
      }
    });
  }
  /** 1. Income vs expenses vs net. */
  renderFlowPanel(grid, records, label) {
    const body = renderPanel(grid, "Money in and out", label);
    const totals = totalsByCurrency(records);
    for (const [currency, item] of [...totals].sort()) {
      if (totals.size > 1) body.createDiv({ cls: "fin-panel-currency", text: currency });
      renderHBars(body, [
        { label: "Income", value: item.income, color: "var(--fin-money-in)" },
        { label: "Expenses", value: item.expenses, color: "var(--fin-money-out)" },
        ...item.transfers ? [{ label: "Transfers", value: item.transfers, color: "var(--text-muted)" }] : []
      ], { currency });
      const net = body.createDiv({ cls: "fin-panel-net" });
      net.createSpan({ text: "Net" });
      net.createSpan({
        cls: `fin-amount ${item.net < 0 ? "fin-out" : "fin-in"}`,
        text: `${item.net < 0 ? "\u2212" : "+"}${formatAmount(item.net)} ${currency}`
      });
    }
  }
  /** 2. Spending by category, clickable through to the list. */
  renderCategoryPanel(grid, records, currency, label) {
    const body = renderPanel(grid, "Where it went", `${label} \xB7 ${currency}`);
    const categories = new Map(this.plugin.index.categories().map((item) => [item.name, item]));
    const spend = spendByCategory(records, currency);
    const total = spend.reduce((sum, item) => sum + item.amount, 0);
    renderDonut(
      body,
      spend.map((item) => ({
        label: item.category,
        value: item.amount,
        color: categoryColor(item.category, categories)
      })),
      {
        total,
        currency,
        onSelect: (category) => {
          this.plugin.store.set({ categories: [category] });
          this.plugin.showTransactionsTab();
        }
      }
    );
  }
  /** 3. Spending over time — by day within a month, by month otherwise. */
  renderTrendPanel(grid, records, currency, today) {
    const filter = this.plugin.store.get();
    const range = resolvePeriod(filter.period, today);
    const body = renderPanel(grid, "Spending over time", currency);
    if (filter.period.unit === "month" && range) {
      const days = spendByDay(records, currency, range.from, range.to);
      renderBars(
        body,
        days.map((day) => ({
          label: String(Number(day.date.slice(8))),
          sublabel: day.date,
          value: day.amount
        })),
        { currency }
      );
      const spent = days.reduce((sum, day) => sum + day.amount, 0);
      const elapsed = days.filter((day) => day.date <= today).length || days.length;
      body.createEl("p", {
        cls: "fin-chart-caption",
        text: `Average ${formatAmount(spent / elapsed)} ${currency} per day so far`
      });
      return;
    }
    const months = records.map((record) => record.month).filter(Boolean);
    if (!months.length) {
      body.createEl("p", { cls: "fin-panel-empty", text: "Nothing to show for this period." });
      return;
    }
    const from = months.reduce((min, month) => month < min ? month : min, months[0]);
    const to = months.reduce((max, month) => month > max ? month : max, months[0]);
    renderBars(
      body,
      spendByMonth(records, currency, from, to).map((item) => ({
        label: SHORT_MONTHS2[Number(item.month.slice(5, 7)) - 1],
        sublabel: item.month,
        value: item.amount
      })),
      { currency }
    );
  }
  /** 4. Budget progress. */
  renderBudgetPanel(grid, records, label) {
    const body = renderPanel(grid, "Budgets", label);
    const categories = this.plugin.index.categories();
    const progress = budgetProgress(categories, records);
    if (!progress.length) {
      body.createEl("p", {
        cls: "fin-panel-empty",
        text: "No budgets set yet. Give a category a monthly budget and it appears here."
      });
      this.renderCategoryEditorButton(body);
      return;
    }
    renderHBars(
      body,
      progress.map((item) => ({
        label: item.category,
        value: item.spent,
        ratio: item.ratio,
        color: item.level === "over" ? "var(--fin-over)" : item.level === "warn" ? "var(--fin-warn)" : void 0,
        caption: item.remaining >= 0 ? `${formatAmount(item.remaining)} left of ${formatAmount(item.budget)}` : `${formatAmount(-item.remaining)} over ${formatAmount(item.budget)}`
      })),
      {
        currency: progress[0].currency,
        onSelect: (category) => {
          this.plugin.store.set({ categories: [category] });
          this.plugin.showTransactionsTab();
        }
      }
    );
    this.renderCategoryEditorButton(body);
  }
  renderCategoryEditorButton(body) {
    const button = body.createEl("button", { cls: "fin-more", text: "Edit categories and budgets" });
    button.addEventListener("click", () => this.plugin.showCategoriesTab());
  }
  /** 5. Top merchants. */
  renderMerchantPanel(grid, records, currency) {
    const body = renderPanel(grid, "Top merchants", currency);
    const merchants = spendByMerchant(records, currency, 10);
    renderHBars(
      body,
      merchants.map((item) => ({
        label: item.merchant,
        value: item.amount,
        caption: `${item.count} transaction${item.count === 1 ? "" : "s"}`
      })),
      {
        currency,
        onSelect: (merchant) => {
          this.plugin.store.set({ search: merchant });
          this.plugin.showTransactionsTab();
        }
      }
    );
  }
  /** 6. Account balances. Always all-time — a filtered balance is meaningless. */
  renderBalancePanel(grid) {
    const body = renderPanel(grid, "Balances", "All transactions");
    const balances = deriveBalances(this.plugin.index.accounts(), this.plugin.index.transactions());
    if (!balances.length) {
      body.createEl("p", { cls: "fin-panel-empty", text: "No accounts set up yet." });
      return;
    }
    renderHBars(
      body,
      balances.filter((item) => item.balance !== 0).sort((a, b) => b.balance - a.balance).map((item) => ({
        label: item.account.name,
        value: item.balance,
        caption: item.account.currency,
        // An account in the red is the one thing on this panel worth
        // spotting without reading the number.
        color: item.balance < 0 ? "var(--fin-money-out)" : void 0
      })),
      { currency: "" }
    );
    for (const [currency, value] of [...netWorthByCurrency(balances)].sort()) {
      const net = body.createDiv({ cls: "fin-panel-net" });
      net.createSpan({ text: `Net worth (${currency})` });
      net.createSpan({
        cls: `fin-amount ${value < 0 ? "fin-out" : ""}`,
        text: formatSignedAmount(value)
      });
    }
  }
};

// src/ui/budget-view.ts
var BUDGET_VIEW_TYPE = "finance-budget-view";
var TABS = [
  { id: "transactions", label: "Transactions" },
  { id: "merchants", label: "Merchants" },
  { id: "categories", label: "Categories" },
  { id: "accounts", label: "Accounts" },
  { id: "stats", label: "Stats" }
];
var BudgetView = class extends import_obsidian22.ItemView {
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
    this.merchantsTab = new MerchantsTab(this.plugin);
    this.categoriesTab = new CategoriesTab(this.plugin);
    this.accountsTab = new AccountsTab(this.plugin);
    this.statsTab = new StatsTab(this.plugin);
    this.tabBarEl = root.createDiv({ cls: "fin-tabs" });
    this.headerEl = root.createDiv({ cls: "fin-header" });
    this.bodyEl = root.createDiv({ cls: "fin-tab-body" });
    this.renderTabBar();
    this.renderActiveTab();
    this.unsubscribe.push(this.plugin.index.subscribe(() => this.renderActiveTab()));
    this.unsubscribe.push(this.plugin.store.subscribe(() => {
      void this.plugin.persistFilter();
      this.transactionsTab.resetPaging();
      this.merchantsTab.resetPaging();
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
  showTab(tab) {
    this.activeTab = tab;
    this.renderTabBar();
    this.renderActiveTab();
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
    else if (this.activeTab === "merchants") this.renderMerchants();
    else if (this.activeTab === "categories") this.renderCategories();
    else if (this.activeTab === "accounts") this.renderAccounts();
    else this.renderStats();
  }
  renderTransactions() {
    this.transactionsTab.render(this.bodyEl);
  }
  renderMerchants() {
    this.merchantsTab.render(this.bodyEl);
  }
  renderCategories() {
    this.categoriesTab.render(this.bodyEl);
  }
  renderAccounts() {
    this.accountsTab.render(this.bodyEl);
  }
  renderStats() {
    this.statsTab.render(this.bodyEl);
  }
};

// src/ui/components/add-transaction-modal.ts
var import_obsidian23 = require("obsidian");
var AddTransactionModal = class extends import_obsidian23.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.draft = {
      amount: "",
      currency: "EGP",
      date: cairoToday(),
      time: (/* @__PURE__ */ new Date()).toTimeString().slice(0, 5),
      type: "debit",
      account: "",
      toAccount: "",
      category: "Uncategorized",
      counterparty: "",
      note: ""
    };
  }
  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("fin-sheet");
    contentEl.empty();
    contentEl.createEl("h2", { text: "Add transaction" });
    const accounts = this.plugin.index.accounts().map((account) => account.name).sort();
    const categories = this.plugin.index.categories().map((category) => category.name).sort();
    this.draft.account = accounts[0] ?? "";
    this.draft.currency = this.plugin.index.accounts()[0]?.currency ?? "EGP";
    new import_obsidian23.Setting(contentEl).setName("Amount").addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.inputMode = "decimal";
      text.inputEl.focus();
      text.setValue(this.draft.amount).onChange((value) => {
        this.draft.amount = value;
      });
    }).addText(
      (text) => text.setValue(this.draft.currency).onChange((value) => {
        this.draft.currency = value;
      })
    );
    new import_obsidian23.Setting(contentEl).setName("Type").addDropdown((dropdown) => {
      dropdown.addOption("debit", "Spending");
      dropdown.addOption("credit", "Income");
      dropdown.addOption("transfer", "Transfer");
      dropdown.addOption("fee", "Fee");
      dropdown.setValue(this.draft.type).onChange((value) => {
        this.draft.type = value;
        toAccountSetting.settingEl.toggleClass("is-hidden", value !== "transfer");
        partySetting.setName(ROLE_LABELS[roleForType(this.draft.type)]);
      });
    });
    new import_obsidian23.Setting(contentEl).setName("Account").addDropdown((dropdown) => {
      const options = accounts.length ? accounts : ["Cash"];
      for (const name of options) dropdown.addOption(name, name);
      this.draft.account = this.draft.account || options[0];
      dropdown.setValue(this.draft.account).onChange((value) => {
        this.draft.account = value;
      });
    });
    const toAccountSetting = new import_obsidian23.Setting(contentEl).setName("To account").addDropdown((dropdown) => {
      dropdown.addOption("", "\u2014");
      for (const name of accounts) dropdown.addOption(name, name);
      dropdown.setValue(this.draft.toAccount).onChange((value) => {
        this.draft.toAccount = value;
      });
    });
    toAccountSetting.settingEl.toggleClass("is-hidden", this.draft.type !== "transfer");
    new import_obsidian23.Setting(contentEl).setName("Category").addDropdown((dropdown) => {
      const options = categories.length ? categories : ["Uncategorized"];
      for (const name of options) dropdown.addOption(name, name);
      dropdown.setValue(options.includes(this.draft.category) ? this.draft.category : options[0]).onChange((value) => {
        this.draft.category = value;
      });
    });
    const partySetting = new import_obsidian23.Setting(contentEl).setName(ROLE_LABELS[roleForType(this.draft.type)]).addText(
      (text) => text.setPlaceholder("Who was on the other side?").setValue(this.draft.counterparty).onChange((value) => {
        this.draft.counterparty = value;
      })
    );
    new import_obsidian23.Setting(contentEl).setName("Date").addText((text) => {
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
    new import_obsidian23.Setting(contentEl).setName("Note").addTextArea(
      (text) => text.setValue(this.draft.note).onChange((value) => {
        this.draft.note = value;
      })
    );
    const actions = contentEl.createDiv({ cls: "fin-sheet-actions" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const save = actions.createEl("button", { cls: "mod-cta", text: "Add" });
    save.addEventListener("click", () => void this.save());
  }
  async save() {
    const amount = Number(this.draft.amount.replaceAll(",", ""));
    if (!Number.isFinite(amount) || amount === 0) {
      new import_obsidian23.Notice("Enter an amount.");
      return;
    }
    if (!this.draft.account) {
      new import_obsidian23.Notice("Choose an account.");
      return;
    }
    const isCredit = this.draft.type === "credit";
    try {
      const file = await createManualTransaction(this.app, {
        timestamp: `${this.draft.date}T${this.draft.time || "00:00"}:00`,
        amount: Math.abs(amount),
        currency: this.draft.currency.trim().toUpperCase() || "EGP",
        fromAccount: isCredit ? "" : this.draft.account,
        toAccount: isCredit ? this.draft.account : this.draft.toAccount,
        category: this.draft.category,
        counterparty: this.draft.counterparty,
        type: this.draft.type,
        note: this.draft.note
      });
      new import_obsidian23.Notice(`Added ${file.basename}.`);
      this.close();
    } catch (error) {
      new import_obsidian23.Notice(`Could not add the transaction: ${error.message}`);
    }
  }
};

// src/ui/components/transaction-sheet.ts
var import_obsidian24 = require("obsidian");
var TYPE_CHOICES = {
  debit: "Spending",
  credit: "Income",
  transfer: "Transfer",
  fee: "Fee"
};
var TransactionSheet = class extends import_obsidian24.Modal {
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
      counterparty: record.counterparty,
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
      text: this.record.counterparty || this.record.category || "Transaction"
    });
    const accounts = this.plugin.index.accounts().map((account) => account.name).sort();
    const categories = this.plugin.index.categories().map((category) => category.name).sort();
    new import_obsidian24.Setting(contentEl).setName("Amount").addText(
      (text) => text.setValue(this.draft.amount).onChange((value) => {
        this.draft.amount = value;
      })
    ).addText(
      (text) => text.setPlaceholder("EGP").setValue(this.draft.currency).onChange((value) => {
        this.draft.currency = value;
      })
    );
    new import_obsidian24.Setting(contentEl).setName("Date").addText((text) => {
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
    new import_obsidian24.Setting(contentEl).setName("Type").addDropdown((dropdown) => {
      dropdown.addOption("", "Unknown");
      for (const [value, label] of Object.entries(TYPE_CHOICES)) dropdown.addOption(value, label);
      dropdown.setValue(this.draft.type).onChange((value) => {
        this.draft.type = value;
        partySetting.setName(ROLE_LABELS[roleForType(this.draft.type)]);
      });
    });
    new import_obsidian24.Setting(contentEl).setName("Category").addDropdown((dropdown) => {
      const options = categories.length ? categories : ["Uncategorized"];
      if (!options.includes(this.draft.category)) options.unshift(this.draft.category);
      for (const name of options) dropdown.addOption(name, name);
      dropdown.setValue(this.draft.category).onChange((value) => {
        this.draft.category = value;
      });
    });
    this.accountSetting(contentEl, "From account", accounts, "fromAccount");
    this.accountSetting(contentEl, "To account", accounts, "toAccount");
    const partySetting = new import_obsidian24.Setting(contentEl).setName(ROLE_LABELS[roleForType(this.draft.type)]).addText(
      (text) => text.setValue(this.draft.counterparty).onChange((value) => {
        this.draft.counterparty = value;
      })
    );
    new import_obsidian24.Setting(contentEl).setName("Exclude from calculations").setDesc("The transaction stays in the list but counts towards nothing.").addToggle(
      (toggle) => toggle.setValue(this.draft.excluded).onChange((value) => {
        this.draft.excluded = value;
        reasonSetting.settingEl.toggleClass("is-hidden", !value);
      })
    );
    const reasonSetting = new import_obsidian24.Setting(contentEl).setName("Reason").addText(
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
    new import_obsidian24.Setting(container).setName(label).addDropdown((dropdown) => {
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
      new import_obsidian24.Notice("That amount is not a number.");
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
        ...counterpartyFields(this.draft.counterparty, roleForType(this.draft.type)),
        transaction_type: this.draft.type,
        excluded: this.draft.excluded ? true : null,
        exclude_reason: this.draft.excluded ? this.draft.excludeReason || "Excluded by hand" : null,
        // Editing by hand always makes the decision manual, so no rule will undo it.
        exclude_source: this.draft.excluded ? "manual" : null,
        exclude_rule_id: null
      });
      this.close();
    } catch (error) {
      new import_obsidian24.Notice(`Could not save: ${error.message}`);
    }
  }
};

// src/main.ts
var SMS_PATTERNS_PATH = `${SETTINGS_DIR}/sms_patterns.json`;
var FinanceAutomationPlugin = class extends import_obsidian25.Plugin {
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
    registerFinanceCodeBlock(this);
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
      id: "import-sms-inbox",
      name: "Import messages from the SMS inbox",
      callback: async () => {
        const captured = await this.captureInbox();
        if (captured) void this.runFinance(false);
        else new import_obsidian25.Notice(`Finance: no messages waiting in ${INBOX_DIR}.`);
      }
    });
    this.addCommand({
      id: "add-transaction",
      name: "Add transaction",
      callback: () => this.openAddTransactionModal()
    });
    this.addCommand({
      id: "export-transactions-csv",
      name: "Export filtered transactions as CSV",
      callback: async () => {
        const records = applyFilter(this.index.transactions(), this.store.get(), cairoToday());
        const path = await exportCsv(this.app, records, periodLabel(this.store.get().period));
        new import_obsidian25.Notice(`Exported ${records.length} transactions to ${path}.`);
      }
    });
    this.addCommand({
      id: "fill-counterparties",
      name: "Fill in missing merchants from stored messages",
      callback: async () => {
        const updated = await this.fillMissingCounterparties();
        new import_obsidian25.Notice(`Finance: named the other side of ${updated} transaction(s).`, 6e3);
      }
    });
    this.addCommand({
      id: "list-merchants",
      name: "List merchants, recipients and senders",
      callback: () => void this.activateBudgetView().then(() => this.showBudgetTab("merchants"))
    });
    this.addCommand({
      id: "edit-categories",
      name: "Edit categories and budgets",
      callback: () => this.showCategoriesTab()
    });
    this.addCommand({
      id: "edit-exclusion-rules",
      name: "Edit exclusion rules",
      callback: () => new RulesEditorModal(this.app, this).open()
    });
    this.addCommand({
      id: "apply-exclusion-rules",
      name: "Apply exclusion rules to all transactions",
      callback: async () => {
        const updated = await this.applyRulesToAll();
        new import_obsidian25.Notice(`Finance: updated ${updated} transaction(s).`);
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
      this.startupTimer = window.setTimeout(() => void (async () => {
        const captured = await this.captureInbox();
        if (this.settings.runOnStartup || captured) await this.runFinance(false);
      })(), 1500);
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
  showBudgetTab(tab) {
    for (const leaf of this.app.workspace.getLeavesOfType(BUDGET_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof BudgetView) view.showTab(tab);
    }
  }
  showTransactionsTab() {
    this.showBudgetTab("transactions");
  }
  openTransactionSheet(record) {
    new TransactionSheet(this.app, this, record).open();
  }
  showCategoriesTab() {
    void this.activateBudgetView().then(() => this.showBudgetTab("categories"));
  }
  openAddTransactionModal() {
    new AddTransactionModal(this.app, this).open();
  }
  async persistFilter() {
    const data = await this.loadData() ?? {};
    await this.saveData({ ...data, filter: this.store.serialize() });
  }
  async handleCaptureLink(kind, params) {
    try {
      let file;
      if (kind === "sms") {
        const patterns = await this.loadPatterns();
        const message = protocolMessage(params);
        if (message && !isTransactionMessage(message, patterns)) {
          new import_obsidian25.Notice("Finance: ignored \u2014 that message is not about money moving.", 6e3);
          return;
        }
        file = await createRawSmsTransaction(this.app, params, patterns);
      } else {
        file = await createStructuredTransaction(this.app, params);
      }
      new import_obsidian25.Notice(`Finance: captured ${file.path}.`, 5e3);
    } catch (error) {
      console.error("Finance capture link failed", error);
      new import_obsidian25.Notice(`Finance capture failed: ${error.message}`, 1e4);
    }
  }
  /**
   * Drains `Budget/Inbox` into transaction notes and reports what happened.
   *
   * Returns the number captured; a caller that gets a non-zero answer owes the
   * new notes a parsing pass. The index is nudged for each one because
   * metadataCache has not necessarily seen a file this same tick.
   */
  async captureInbox() {
    const inbox = await ingestInbox(this.app, await this.loadPatterns());
    for (const failure of inbox.failed) {
      console.error("Finance inbox capture failed", failure.path, failure.error);
    }
    const summary = describeInbox(inbox);
    if (summary) new import_obsidian25.Notice(`Finance: ${summary}.`, 6e3);
    for (const path of inbox.created) this.index.refreshPath(path);
    return inbox.created.length;
  }
  /**
   * The vault's patterns, topped up with the built-in ones for the party a
   * message names. The vault's own entries are tried first, so nothing written
   * by hand is overruled.
   */
  async loadPatterns() {
    return withDefaultPatterns(await loadVaultJson(this.app, SMS_PATTERNS_PATH, {}));
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
      if (showNotice) new import_obsidian25.Notice("Finance processing is already running; another pass is queued.");
      return;
    }
    this.running = true;
    this.setStatus("running\u2026");
    if (showNotice) new import_obsidian25.Notice("Finance: processing\u2026");
    try {
      if (await this.captureInbox()) this.queued = true;
      const updated = await this.processPending();
      this.setStatus("ready");
      if (showNotice) new import_obsidian25.Notice(`Finance: updated ${updated} transaction(s).`, 6e3);
    } catch (error) {
      this.setStatus("error");
      console.error("Finance automation failed", error);
      new import_obsidian25.Notice(`Finance automation failed: ${error.message}`, 1e4);
    } finally {
      this.running = false;
      if (this.queued) {
        this.queued = false;
        window.setTimeout(() => void this.runFinance(false), 500);
      }
    }
  }
  /** Everything the parser reads, gathered the same way for every caller. */
  async loadParserInputs() {
    const [config, patterns, accountsJson, categories] = await Promise.all([
      loadVaultJson(this.app, CONFIG_PATH, { default_currency: "EGP" }),
      this.loadPatterns(),
      loadVaultJson(this.app, ACCOUNTS_JSON_PATH, { accounts: [] }),
      loadVaultJson(this.app, CATEGORY_RULES_PATH, { rules: [] })
    ]);
    return {
      config,
      patterns,
      accounts: mergeAccountSources(this.index.accounts(), accountsJson),
      categories
    };
  }
  /**
   * Reads the merchant, recipient or sender out of the stored message of every
   * transaction that names nobody yet.
   *
   * A note that reached `parsed` is never parsed again, so transactions filed
   * before the parser learned a wording keep their empty party key forever.
   * This is the catch-up pass, and it only ever fills a blank: a name already
   * in the note, typed or parsed, is left exactly as it is.
   */
  async fillMissingCounterparties() {
    const { config, patterns, accounts, categories } = await this.loadParserInputs();
    let updated = 0;
    for (const record of this.index.transactions()) {
      if (record.counterparty || !record.smsMessage) continue;
      const parsed = parseSms(record.smsMessage, record.timestamp, config, patterns, accounts, categories);
      const { counterparty, counterpartyRole } = readCounterparty(parsed);
      if (!counterparty) continue;
      this.ignoreWatchUntil.set(record.path, Date.now() + 2e3);
      await updateTransaction(
        this.app,
        record.path,
        counterpartyFields(counterparty, counterpartyRole)
      );
      updated += 1;
    }
    return updated;
  }
  async processPending() {
    const { config, patterns, accounts, categories } = await this.loadParserInputs();
    const { rules } = await loadRules(this.app);
    let updated = 0;
    for (const record of this.index.transactions()) {
      let changes = {};
      const provisional = isPlaceholderAccount(record.fromAccount) || isPlaceholderAccount(record.toAccount);
      const needsParsing = (record.status !== "parsed" || provisional) && Boolean(record.smsMessage);
      if (needsParsing) {
        const parsed = parseSms(record.smsMessage, record.timestamp, config, patterns, accounts, categories);
        changes = parserChanges(record, parsed);
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
  /**
   * Writes a new category note and answers with its path. It borrows the
   * currency of the categories already there, since a vault that budgets in one
   * currency almost never gains a second.
   */
  async createCategory(name) {
    const currency = this.index.categories()[0]?.currency ?? "EGP";
    const path = await createCategoryNote(this.app, {
      name,
      currency,
      color: null,
      icon: null,
      monthlyBudget: null
    });
    this.index.refreshPath(path);
    return path;
  }
  /**
   * Files every transaction of one category under another, and answers with how
   * many moved. The writes are hidden from the watcher: re-filing a transaction
   * changes nothing the parser would want to look at again.
   */
  async recategorize(from, to) {
    let moved = 0;
    for (const record of this.index.transactions()) {
      if (record.category !== from) continue;
      this.ignoreWatchUntil.set(record.path, Date.now() + 2e3);
      await updateTransaction(this.app, record.path, { category: to });
      moved += 1;
    }
    return moved;
  }
  /**
   * Points every transaction that named one account at another, and answers
   * with how many moved. An account is matched by name everywhere money is
   * counted, so a renamed note whose transactions still carry the old name
   * would leave both of them holding half a balance.
   */
  async renameAccountReferences(from, to) {
    let moved = 0;
    for (const record of this.index.transactions()) {
      const changes = {};
      if (sameName(record.fromAccount, from)) changes.from_account = to;
      if (sameName(record.toAccount, from)) changes.to_account = to;
      if (!Object.keys(changes).length) continue;
      this.ignoreWatchUntil.set(record.path, Date.now() + 2e3);
      await updateTransaction(this.app, record.path, changes);
      moved += 1;
    }
    return moved;
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
