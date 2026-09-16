import test from "node:test";
import assert from "node:assert/strict";
import { stubObsidian } from "./helpers/obsidian-stub.ts";

stubObsidian();

const { fakeApp } = await import("./helpers/fake-app.ts");
const { ingestInbox, describeInbox } = await import("../src/data/inbox.ts");

const ENCODED_SMS =
  "%D8%AA%D9%85%20%D8%AE%D8%B5%D9%85%20EGP%20350.00%20%D9%85%D9%86%20%D8%A8%D8%B7%D8%A7%D9%82%D8%A9";

test("a dropped message becomes a transaction note and the spool file is gone", async () => {
  const app = fakeApp();
  app.vault.files.set("Budget/Inbox/2026-09-12-101500.txt", "تم خصم EGP 350.00 من بطاقة 0779");

  const result = await ingestInbox(app);

  assert.equal(result.created.length, 1);
  assert.match(result.created[0], /^Budget\/Transactions\/\d{4}\/[A-Z][a-z]{2}\/\d{2}T/);
  assert.equal(app.vault.files.has("Budget/Inbox/2026-09-12-101500.txt"), false);
  const note = app.vault.files.get(result.created[0]) ?? "";
  assert.match(note, /sms_message: "تم خصم EGP 350\.00 من بطاقة 0779"/);
  assert.match(note, /status: pending/);
  assert.match(note, /source: iphone-shortcut-sms/);
});

test("a message still in its encoded spelling is decoded on the way in", async () => {
  const app = fakeApp();
  app.vault.files.set("Budget/Inbox/a.txt", ENCODED_SMS);

  const result = await ingestInbox(app);

  const note = app.vault.files.get(result.created[0]) ?? "";
  assert.match(note, /تم خصم EGP 350\.00 من بطاقة/);
  assert.doesNotMatch(note, /%D8%AA/);
});

test("no inbox folder is not an error", async () => {
  const result = await ingestInbox(fakeApp());
  assert.deepEqual(result, { created: [], empty: [], ignored: [], failed: [] });
});

test("captures arrive in the order the messages were spooled", async () => {
  const app = fakeApp();
  app.vault.files.set("Budget/Inbox/2026-09-12-110000.txt", "Card *7147 was charged for EGP 20 at second");
  app.vault.files.set("Budget/Inbox/2026-09-12-090000.txt", "Card *7147 was charged for EGP 10 at first");

  const result = await ingestInbox(app);

  assert.equal(result.created.length, 2);
  const bodies = result.created.map((path) => app.vault.files.get(path) ?? "");
  assert.match(bodies[0], /at first/);
  assert.match(bodies[1], /at second/);
});

test("an empty file is left in place rather than becoming a blank transaction", async () => {
  const app = fakeApp();
  app.vault.files.set("Budget/Inbox/blank.txt", "   \n  ");

  const result = await ingestInbox(app);

  assert.deepEqual(result.created, []);
  assert.deepEqual(result.empty, ["Budget/Inbox/blank.txt"]);
  assert.equal(app.vault.files.has("Budget/Inbox/blank.txt"), true);
});

test("only message-shaped files are read", async () => {
  const app = fakeApp();
  app.vault.files.set("Budget/Inbox/screenshot.png", "binary");
  app.vault.files.set("Budget/Inbox/note.md", "Card *7147 was charged for EGP 5");

  const result = await ingestInbox(app);

  assert.equal(result.created.length, 1);
  assert.equal(app.vault.files.has("Budget/Inbox/screenshot.png"), true);
});

test("the folder README is never read as a message", async () => {
  const app = fakeApp();
  app.vault.files.set("Budget/Inbox/README.md", "# Inbox\n\nDrop bank messages here.");
  app.vault.files.set("Budget/Inbox/msg.txt", "Card *7147 was charged for EGP 7");

  const result = await ingestInbox(app);

  assert.equal(result.created.length, 1);
  assert.equal(app.vault.files.has("Budget/Inbox/README.md"), true);
});

test("a failed capture keeps its spool file so nothing is consumed silently", async () => {
  const app = fakeApp();
  app.vault.files.set("Budget/Inbox/boom.txt", "Card *7147 was charged for EGP 1");
  app.vault.create = async () => {
    throw new Error("disk full");
  };

  const result = await ingestInbox(app);

  assert.deepEqual(result.created, []);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].error, "disk full");
  assert.equal(app.vault.files.has("Budget/Inbox/boom.txt"), true);
});

test("describeInbox stays quiet when the inbox was empty", () => {
  assert.equal(describeInbox({ created: [], empty: [], ignored: [], failed: [] }), null);
  assert.equal(
    describeInbox({ created: ["a", "b"], empty: ["c"], ignored: [], failed: [] }),
    "captured 2 message(s) from the inbox, 1 empty file(s) left in place",
  );
  assert.equal(
    describeInbox({ created: [], empty: [], ignored: ["a", "b"], failed: [] }),
    "discarded 2 non-transaction message(s)",
  );
});

// --- messages that are not transactions ---

const MINIMUM_DUE =
  "عميلنا العزيز،\nنذكركم بضرورة سداد الحد الأدنى وقدره 1 جم على بطاقتكم المغطاة التي تنتهي بـ 7147 " +
  "الخاص بكشف حساب شهر اغسطس - 2026 في موعد أقصاه يوم 25/9/2026 .";

test("a statement reminder is deleted rather than filed as a 1 EGP transaction", async () => {
  const app = fakeApp();
  app.vault.files.set("Budget/Inbox/reminder.txt", MINIMUM_DUE);

  const result = await ingestInbox(app);

  assert.deepEqual(result.created, []);
  assert.deepEqual(result.ignored, ["Budget/Inbox/reminder.txt"]);
  assert.equal(app.vault.files.has("Budget/Inbox/reminder.txt"), false);
});

test("a one-time code is deleted even though it carries digits", async () => {
  const app = fakeApp();
  app.vault.files.set("Budget/Inbox/otp.txt", "Your one-time code is 4829. Valid for 5 minutes.");

  const result = await ingestInbox(app);

  assert.deepEqual(result.created, []);
  assert.deepEqual(result.ignored, ["Budget/Inbox/otp.txt"]);
});

test("a real transaction alongside the noise is the only one kept", async () => {
  const app = fakeApp();
  app.vault.files.set("Budget/Inbox/1-reminder.txt", MINIMUM_DUE);
  app.vault.files.set("Budget/Inbox/2-debit.txt", "تم خصم EGP 350.00 من بطاقة الخصم المباشر # **0779");
  app.vault.files.set("Budget/Inbox/3-offer.txt", "اربح رحلة مجانية مع عروض الصيف! اتصل بـ 19666");

  const result = await ingestInbox(app);

  assert.equal(result.created.length, 1);
  assert.deepEqual(result.ignored, ["Budget/Inbox/1-reminder.txt", "Budget/Inbox/3-offer.txt"]);
  const left = [...app.vault.files.keys()].filter((path) => path.startsWith("Budget/Inbox/"));
  assert.deepEqual(left, []);
});

test("an encoded message is decoded before the keywords are looked for", async () => {
  const app = fakeApp();
  app.vault.files.set("Budget/Inbox/encoded.txt", ENCODED_SMS);

  const result = await ingestInbox(app);

  assert.equal(result.created.length, 1);
  assert.deepEqual(result.ignored, []);
});

test("the vault's own transaction_keywords let an unusual wording through", async () => {
  const app = fakeApp();
  app.vault.files.set("Budget/Inbox/odd.txt", "Votre compte a été prélevé de EGP 40");

  const before = await ingestInbox(app);
  assert.deepEqual(before.created, []);

  app.vault.files.set("Budget/Inbox/odd.txt", "Votre compte a été prélevé de EGP 40");
  const after = await ingestInbox(app, { transaction_keywords: ["prélevé"] });
  assert.equal(after.created.length, 1);
});
