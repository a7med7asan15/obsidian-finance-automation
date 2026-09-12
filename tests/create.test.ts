import test from "node:test";
import assert from "node:assert/strict";
import { stubObsidian } from "./helpers/obsidian-stub.ts";

stubObsidian();

const { fakeApp } = await import("./helpers/fake-app.ts");
const {
  createRawSmsTransaction,
  createStructuredTransaction,
  createManualTransaction,
  protocolMessage,
  decodePercentEscapes,
  transactionPathParts,
} = await import("../src/data/create.ts");

const DATE_PATTERNS = {
  date_patterns: [
    "(?i)on\\s+(?P<day>[0-9]{1,2})/(?P<month>[0-9]{1,2})/(?P<year>[0-9]{4})(?:\\s+(?P<hour>[0-9]{1,2}):(?P<minute>[0-9]{2}))?",
  ],
};

test("a raw SMS capture lands at the timestamped path with status pending", async () => {
  const app = fakeApp();
  const file = await createRawSmsTransaction(app, {
    message: "Card 1234 purchase amount EGP 120.50 at Carrefour",
    timestamp: "2026-08-29T14:35:02+03:00",
  });
  assert.equal(file.path, "Budget/Transactions/2026/Aug/29T14-35-02.md");
  const content = app.vault.files.get(file.path)!;
  assert.match(content, /status: pending/);
  assert.match(content, /source: iphone-shortcut-sms/);
  assert.match(content, /sms_message: "Card 1234 purchase amount EGP 120.50 at Carrefour"/);
});

test("a second capture in the same second gets a suffix", async () => {
  const app = fakeApp();
  const params = { message: "First SMS", timestamp: "2026-08-29T14:35:02+03:00" };
  await createRawSmsTransaction(app, params);
  const duplicate = await createRawSmsTransaction(app, { ...params, message: "Another SMS" });
  assert.equal(duplicate.path, "Budget/Transactions/2026/Aug/29T14-35-02-2.md");
});

test("a message containing & round-trips whole", () => {
  // Obsidian split "Paid 50 to A&B=C today" into three parameters.
  assert.equal(
    protocolMessage({ message: "Paid 50 to A", B: "C today" }),
    "Paid 50 to A&B=C today",
  );
  assert.equal(protocolMessage({ message: "Ref 9", "x#tag": "" }), "Ref 9&x#tag");
  assert.equal(protocolMessage({ message: "Plain text" }), "Plain text");
});

test("a message that arrives still percent-encoded is decoded", () => {
  assert.equal(
    protocolMessage({ message: "%D8%AA%D9%85%20%D8%AE%D8%B5%D9%85%20EGP%20350.00" }),
    "تم خصم EGP 350.00",
  );
  assert.equal(
    protocolMessage({ message: "%2520%D8%AA%D9%85" }),
    " تم",
  );
});

test("decoding keeps the readable part when an escape is cut in half", () => {
  // A link truncated mid-escape: the last two bytes are half an Arabic letter.
  assert.equal(decodePercentEscapes("%D8%AA%D9%85%20%D8"), "تم %D8");
});

test("decoding leaves an already readable message alone", () => {
  assert.equal(decodePercentEscapes("Paid 50% at Cafe%20"), "Paid 50% at Cafe%20");
  assert.equal(decodePercentEscapes("تم خصم 350 جنيه"), "تم خصم 350 جنيه");
});

test("a captured message keeps its own & through to the note", async () => {
  const app = fakeApp();
  const file = await createRawSmsTransaction(app, {
    message: "Purchase at Mario",
    " Luigi": "EGP 50",
    timestamp: "2026-08-29T14:35:02+03:00",
  });
  assert.match(app.vault.files.get(file.path)!, /sms_message: "Purchase at Mario& Luigi=EGP 50"/);
});

test("a message carrying its own date is filed under that date, not now", async () => {
  const app = fakeApp();
  const file = await createRawSmsTransaction(
    app,
    { message: "Purchase EGP 100 at Carrefour on 05/09/2026 14:07" },
    DATE_PATTERNS,
  );
  assert.equal(file.path, "Budget/Transactions/2026/Sep/05T14-07-00.md");
});

test("an explicit timestamp parameter beats a date in the message", async () => {
  const app = fakeApp();
  const file = await createRawSmsTransaction(
    app,
    { message: "Purchase on 05/09/2026 14:07", timestamp: "2026-01-02T03:04:05+03:00" },
    DATE_PATTERNS,
  );
  assert.equal(file.path, "Budget/Transactions/2026/Jan/02T03-04-05.md");
});

test("a message with no date at all falls back to the capture time", async () => {
  const app = fakeApp();
  const file = await createRawSmsTransaction(app, { message: "Your statement is ready" }, DATE_PATTERNS);
  assert.equal(file.path, `Budget/Transactions/${transactionPathParts(new Date().toISOString())}.md`);
});

test("an empty message is rejected", async () => {
  await assert.rejects(() => createRawSmsTransaction(fakeApp(), {}), /message parameter is empty/);
});

test("a structured capture normalises its fields", async () => {
  const app = fakeApp();
  const file = await createStructuredTransaction(app, {
    amount: "1,200.50",
    currency: "egp",
    account: "Salary account",
    type: "credit",
    merchant: "Employer",
    timestamp: "2026-08-29T14:36:02+03:00",
  });
  const content = app.vault.files.get(file.path)!;
  assert.match(content, /amount: 1200\.5/);
  assert.match(content, /currency: "EGP"/);
  assert.match(content, /to_account: "Salary account"/);
  assert.match(content, /transaction_type: "credit"/);
  // Money in came from a sender, so the name is not written under `merchant`.
  assert.match(content, /sender: "Employer"/);
  assert.doesNotMatch(content, /merchant:/);
  assert.match(content, /status: parsed/);
  assert.match(content, /source: iphone-shortcut-fields/);
});

test("a structured capture with an unknown type needs review", async () => {
  const app = fakeApp();
  const file = await createStructuredTransaction(app, {
    amount: "20", currency: "EGP", account: "Cash", type: "expense",
  });
  assert.match(app.vault.files.get(file.path)!, /status: needs_review/);
});

test("a manual transaction writes its note under a Notes heading", async () => {
  const app = fakeApp();
  const file = await createManualTransaction(app, {
    timestamp: "2026-09-05T12:00:00+03:00",
    amount: 250,
    currency: "EGP",
    fromAccount: "Cash",
    toAccount: "",
    category: "Groceries",
    counterparty: "Souq",
    type: "debit",
    note: "Split with Sara.",
  });
  const content = app.vault.files.get(file.path)!;
  assert.match(content, /source: manual-ui/);
  assert.match(content, /merchant: "Souq"/);
  assert.match(content, /status: parsed/);
  assert.match(content, /## Notes\n\nSplit with Sara\./);
  assert.match(content, /transaction_id: "[0-9a-f]{16}"/);
});
