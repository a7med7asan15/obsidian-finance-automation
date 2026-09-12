import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSms, stableId, normalizeCurrency, extractTimestamp, mergeAccountSources,
} from "../src/domain/parser/sms.ts";
import { buildAccount } from "../src/data/records.ts";
import { categorize } from "../src/domain/categorize.ts";
import { DEFAULT_PARTY_PATTERNS, withDefaultPatterns } from "../src/domain/parser/defaults.ts";
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

const accountNote = (frontmatter: Record<string, unknown>, name: string) =>
  buildAccount({ type: "account", ...frontmatter }, `Budget/Accounts/${name}.md`);

test("mergeAccountSources takes card endings straight from the account notes", () => {
  const merged = mergeAccountSources(
    [accountNote({ name: "CIB", currency: "EGP", card_endings: ["0779", "1934"] }, "CIB")],
    { accounts: [] },
  );
  assert.deepEqual(merged.accounts, [
    { name: "CIB", currency: "EGP", card_endings: ["0779", "1934"], aliases: [] },
  ]);
});

test("mergeAccountSources unions a note and its accounts.json entry by name", () => {
  const merged = mergeAccountSources(
    [accountNote({ name: "CIB", currency: "EGP", card_endings: ["1934"] }, "CIB")],
    { accounts: [{ name: "cib", currency: "EGP", card_endings: ["0779"], aliases: ["cib"] }] },
  );
  assert.equal(merged.accounts.length, 1);
  assert.equal(merged.accounts[0]!.name, "CIB");
  assert.deepEqual(merged.accounts[0]!.card_endings, ["1934", "0779"]);
  assert.deepEqual(merged.accounts[0]!.aliases, ["cib"]);
});

test("mergeAccountSources keeps an accounts.json entry that has no note", () => {
  const merged = mergeAccountSources(
    [accountNote({ name: "CIB", card_endings: ["0779"] }, "CIB")],
    { accounts: [{ name: "Wallet", currency: "EGP", card_endings: ["4242"] }] },
  );
  assert.deepEqual(merged.accounts.map((account) => account.name), ["CIB", "Wallet"]);
});

test("an ending listed only on the note resolves to the account", () => {
  const accounts = mergeAccountSources(
    [accountNote({ name: "CIB", currency: "EGP", card_endings: ["0779", "1934"] }, "CIB")],
    { accounts: [] },
  );
  const result = parseSms(
    "Card ending 1934 purchase amount EGP 99 at Carrefour",
    "2026-09-05T12:00:00+03:00", { default_currency: "EGP" }, PATTERNS, accounts, CATEGORIES,
  );
  assert.equal(result.from_account, "CIB");
  assert.equal(result.status, "parsed");
});

// --- the party a message names ---

const withDefaults = (sms: string, patterns: SmsPatterns = PATTERNS) =>
  parseSms(
    sms, "2026-09-05T12:00:00+03:00", { default_currency: "EGP" },
    withDefaultPatterns(patterns), ACCOUNTS, CATEGORIES,
  );

test("a purchase names a merchant and leaves the other two keys empty", () => {
  const result = withDefaults("Card 0774 purchase amount EGP 120 at Seoudi on 05/09");
  assert.equal(result.merchant, "Seoudi");
  assert.equal(result.recipient, "");
  assert.equal(result.sender, "");
});

test("a transfer names a recipient, not a merchant", () => {
  const result = withDefaults("EGP 500 transferred to Ahmed Hassan from account 0774. Ref 99.");
  assert.equal(result.transaction_type, "transfer");
  assert.equal(result.recipient, "Ahmed Hassan");
  assert.equal(result.merchant, "");
  assert.equal(result.sender, "");
});

test("money in names a sender, not a merchant", () => {
  const result = withDefaults("Account 0774 credited EGP 12000 from ACME PAYROLL on 01/09.");
  assert.equal(result.transaction_type, "credit");
  assert.equal(result.sender, "ACME PAYROLL");
  assert.equal(result.merchant, "");
  assert.equal(result.recipient, "");
});

test("the Arabic 'عند' wording gives the merchant, with the bank's padding folded", () => {
  const result = withDefaults(
    "تم خصم EGP 350.00  من بطاقة الخصم المباشر # **0774 باستخدام Apple Pay عند  CANCUN RESORT   SPA في  10/09/26 12:16الرصيد المتاح  EGP725.07.",
  );
  assert.equal(result.merchant, "CANCUN RESORT SPA");
  assert.equal(result.transaction_type, "debit");
});

test("'من بطاقة' is the card the money left, never a sender", () => {
  // The same Arabic debit: "from the direct debit card" must not be read as a
  // name, or every card purchase would claim a sender called "the card".
  const result = withDefaults(
    "تم اضافة EGP 350.00 من بطاقة الخصم المباشر # **0774 في 10/09/26",
  );
  assert.equal(result.transaction_type, "credit");
  assert.equal(result.sender, "");
});

test("an Arabic transfer names the person it went to", () => {
  const result = withDefaults("تم تحويل EGP 500 من حساب 0774 إلى احمد حسن في 05/09/26");
  assert.equal(result.transaction_type, "transfer");
  assert.equal(result.recipient, "احمد حسن");
});

test("a refund credits the merchant it came from, the merchant patterns filling in", () => {
  const result = withDefaults("Account 0774 credited EGP 90 refund at Carrefour on 05/09.");
  assert.equal(result.transaction_type, "credit");
  assert.equal(result.sender, "Carrefour");
});

test("the merchant feeds categorising, so a name alone can file a transaction", () => {
  const result = withDefaults("Card 0774 debited EGP 60 at CARREFOUR MAADI on 05/09");
  assert.equal(result.merchant, "CARREFOUR MAADI");
  assert.equal(result.category, "Groceries");
});

test("withDefaultPatterns appends the built-in party patterns after the vault's own", () => {
  const merged = withDefaultPatterns(PATTERNS);
  assert.deepEqual(merged.merchant_patterns, [
    ...PATTERNS.merchant_patterns!, ...DEFAULT_PARTY_PATTERNS.merchant_patterns,
  ]);
  assert.deepEqual(merged.recipient_patterns, DEFAULT_PARTY_PATTERNS.recipient_patterns);
  // Nothing else is topped up: a pattern removed from the vault file stays removed.
  assert.deepEqual(merged.amount_patterns, PATTERNS.amount_patterns);
  assert.deepEqual(merged.card_ending_patterns, PATTERNS.card_ending_patterns);
});

test("withDefaultPatterns adds no duplicate when the vault already has a default", () => {
  const merged = withDefaultPatterns({
    merchant_patterns: [DEFAULT_PARTY_PATTERNS.merchant_patterns[0]!],
  });
  assert.deepEqual(merged.merchant_patterns, DEFAULT_PARTY_PATTERNS.merchant_patterns);
});
