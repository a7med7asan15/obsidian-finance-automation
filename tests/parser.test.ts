import test from "node:test";
import assert from "node:assert/strict";
import { parseSms, stableId, normalizeCurrency, extractTimestamp } from "../src/domain/parser/sms.ts";
import { categorize } from "../src/domain/categorize.ts";
import type { SmsPatterns, AccountConfig, CategoryRules } from "../src/domain/parser/sms.ts";

const PATTERNS: SmsPatterns = {
  credit_keywords: ["credited", "received", "تم اضافة"],
  debit_keywords: ["purchase", "debited", "تم خصم"],
  transfer_keywords: ["transfer", "transferred", "تحويل"],
  fee_keywords: ["fee", "commission", "رسوم"],
  amount_patterns: [
    "(?i)(?:amount|amt|مبلغ)\\s*[:=-]?\\s*(?:(?P<currency1>EGP|USD|ج\\.?م)\\s*)?(?P<amount>[0-9][0-9,]*(?:\\.[0-9]{1,2})?)(?:\\s*(?P<currency2>EGP|USD|ج\\.?م))?",
    "(?i)(?P<currency1>EGP|USD|ج\\.?م)\\s*(?P<amount>[0-9][0-9,]*(?:\\.[0-9]{1,2})?)",
    "(?i)(?P<amount>[0-9][0-9,]*(?:\\.[0-9]{1,2})?)\\s*(?P<currency2>EGP|USD|ج\\.?م)",
  ],
  card_ending_patterns: ["(?i)(?:card|acct|account|ending|xx+|\\*+)\\s*(?:no\\.?|number)?\\s*[:#-]?\\s*(?P<ending>[0-9]{4})\\b"],
  merchant_patterns: ["(?i)(?:at|merchant)\\s+([A-Za-z0-9][A-Za-z0-9 .&'/_-]{1,50}?)(?=\\s+(?:on|using|with|balance|ref)\\b|[.;,]|$)"],
};

const ACCOUNTS: AccountConfig = {
  accounts: [
    { name: "CIB", currency: "EGP", card_endings: ["0774"], aliases: ["cib"] },
    { name: "Cash", currency: "EGP", card_endings: [], aliases: ["cash"] },
  ],
};

const CATEGORIES: CategoryRules = {
  rules: [
    { category: "Groceries", keywords: ["carrefour", "supermarket"] },
    { category: "Income", keywords: ["salary", "راتب"] },
    { category: "Transfer", keywords: ["transfer", "تحويل"] },
  ],
};

const parse = (sms: string) =>
  parseSms(sms, "2026-09-05T12:00:00+03:00", { default_currency: "EGP" }, PATTERNS, ACCOUNTS, CATEGORIES);

test("parses an English debit SMS end to end", () => {
  const result = parse("Card 0774 purchase amount EGP 1,420.50 at Carrefour on 05/09");
  assert.equal(result.amount, 1420.5);
  assert.equal(result.currency, "EGP");
  assert.equal(result.transaction_type, "debit");
  assert.equal(result.from_account, "CIB");
  assert.equal(result.to_account, "");
  assert.equal(result.merchant, "Carrefour");
  assert.equal(result.category, "Groceries");
  assert.equal(result.status, "parsed");
});

test("parses an Arabic debit SMS", () => {
  const result = parse("تم خصم مبلغ 250 جم من بطاقة 0774");
  assert.equal(result.amount, 250);
  assert.equal(result.currency, "EGP");
  assert.equal(result.transaction_type, "debit");
});

test("a credit lands in to_account", () => {
  const result = parse("Your account 0774 has been credited with EGP 9,000 salary");
  assert.equal(result.transaction_type, "credit");
  assert.equal(result.to_account, "CIB");
  assert.equal(result.from_account, "");
  assert.equal(result.category, "Income");
});

test("a fee is categorised as Fees regardless of keywords", () => {
  const result = parse("A fee of EGP 25 was debited from account 0774");
  assert.equal(result.transaction_type, "fee");
  assert.equal(result.category, "Fees");
});

test("an unrecognised card ending becomes a placeholder account", () => {
  const result = parse("Card 9999 purchase amount EGP 100 at Somewhere");
  assert.equal(result.from_account, "Card ••••9999");
});

test("an unparseable SMS is marked needs_review with low confidence", () => {
  const result = parse("Your statement is ready");
  assert.equal(result.status, "needs_review");
  assert.equal(result.amount, null);
  assert.ok(result.parser_confidence < 0.5);
});

test("transaction_id is stable for the same SMS and timestamp", () => {
  const first = parse("Card 0774 purchase amount EGP 100 at Carrefour");
  const second = parse("Card 0774 purchase amount EGP 100 at Carrefour");
  assert.equal(first.transaction_id, second.transaction_id);
  assert.notEqual(first.transaction_id, parse("Card 0774 purchase amount EGP 101 at Carrefour").transaction_id);
});

test("normalizeCurrency folds the Arabic pound to EGP", () => {
  assert.equal(normalizeCurrency("جم", "EGP"), "EGP");
  assert.equal(normalizeCurrency("ج.م", "EGP"), "EGP");
  assert.equal(normalizeCurrency("usd", "EGP"), "USD");
  assert.equal(normalizeCurrency("", "EGP"), "EGP");
});

test("stableId is deterministic and 16 hex characters", () => {
  assert.equal(stableId("hello"), stableId("hello"));
  assert.match(stableId("hello"), /^[0-9a-f]{16}$/);
  assert.notEqual(stableId("hello"), stableId("hellp"));
});

test("categorize falls back to Uncategorized", () => {
  assert.equal(categorize("bought something at carrefour", CATEGORIES), "Groceries");
  assert.equal(categorize("مرتب الشهر راتب", CATEGORIES), "Income");
  assert.equal(categorize("completely unrelated text", CATEGORIES), "Uncategorized");
});

test("a broken pattern in sms_patterns.json throws a named error", () => {
  const broken: SmsPatterns = { ...PATTERNS, amount_patterns: ["(?P<amount>[unclosed"] };
  assert.throws(
    () => parseSms("anything", "2026-09-05T12:00:00+03:00", {}, broken, ACCOUNTS, CATEGORIES),
    /Invalid SMS pattern/,
  );
});

const DATED: SmsPatterns = {
  ...PATTERNS,
  date_patterns: [
    "(?i)on\\s+(?P<day>[0-9]{1,2})/(?P<month>[0-9]{1,2})/(?P<year>[0-9]{4})(?:\\s+(?P<hour>[0-9]{1,2}):(?P<minute>[0-9]{2}))?",
  ],
};

test("extractTimestamp reads the date the bank wrote in the message", () => {
  assert.equal(
    extractTimestamp("Purchase EGP 100 at Carrefour on 05/09/2026 14:07", DATED),
    "2026-09-05T14:07:00+03:00",
  );
});

test("extractTimestamp defaults a missing time to midnight Cairo", () => {
  assert.equal(
    extractTimestamp("Purchase EGP 100 on 5/9/2026", DATED),
    "2026-09-05T00:00:00+03:00",
  );
});

test("extractTimestamp returns null when nothing matches or no patterns exist", () => {
  assert.equal(extractTimestamp("Your statement is ready", DATED), null);
  assert.equal(extractTimestamp("Purchase on 05/09/2026", PATTERNS), null);
});

test("parseSms ignores date_patterns entirely", () => {
  const withDates = parseSms(
    "Card 0774 purchase amount EGP 100 at Carrefour on 05/09/2026",
    "2026-09-05T12:00:00+03:00", { default_currency: "EGP" }, DATED, ACCOUNTS, CATEGORIES,
  );
  const without = parseSms(
    "Card 0774 purchase amount EGP 100 at Carrefour on 05/09/2026",
    "2026-09-05T12:00:00+03:00", { default_currency: "EGP" }, PATTERNS, ACCOUNTS, CATEGORIES,
  );
  assert.deepEqual(withDates, without);
});
