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
  assert.deepEqual(result, { created: [], empty: [], failed: [] });
});

test("captures arrive in the order the messages were spooled", async () => {
  const app = fakeApp();
  app.vault.files.set("Budget/Inbox/2026-09-12-110000.txt", "second EGP 20");
  app.vault.files.set("Budget/Inbox/2026-09-12-090000.txt", "first EGP 10");

  const result = await ingestInbox(app);

  assert.equal(result.created.length, 2);
  const bodies = result.created.map((path) => app.vault.files.get(path) ?? "");
  assert.match(bodies[0], /first EGP 10/);
  assert.match(bodies[1], /second EGP 20/);
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
  app.vault.files.set("Budget/Inbox/note.md", "EGP 5 debit");

  const result = await ingestInbox(app);

  assert.equal(result.created.length, 1);
  assert.equal(app.vault.files.has("Budget/Inbox/screenshot.png"), true);
});

test("the folder README is never read as a message", async () => {
  const app = fakeApp();
  app.vault.files.set("Budget/Inbox/README.md", "# Inbox\n\nDrop bank messages here.");
  app.vault.files.set("Budget/Inbox/msg.txt", "EGP 7 debit");

  const result = await ingestInbox(app);

  assert.equal(result.created.length, 1);
  assert.equal(app.vault.files.has("Budget/Inbox/README.md"), true);
});

test("a failed capture keeps its spool file so nothing is consumed silently", async () => {
  const app = fakeApp();
  app.vault.files.set("Budget/Inbox/boom.txt", "EGP 1");
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
  assert.equal(describeInbox({ created: [], empty: [], failed: [] }), null);
  assert.equal(
    describeInbox({ created: ["a", "b"], empty: ["c"], failed: [] }),
    "captured 2 message(s) from the inbox, 1 empty file(s) left in place",
  );
});
