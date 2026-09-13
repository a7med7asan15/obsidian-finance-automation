import test from "node:test";
import assert from "node:assert/strict";
import { stubObsidian } from "./helpers/obsidian-stub.ts";

stubObsidian();

const { fakeApp } = await import("./helpers/fake-app.ts");
const {
  accountNote, accountNotePath, createAccountNote, renameAccountNote,
} = await import("../src/data/accounts.ts");
const { updateAccountNote } = await import("../src/data/write.ts");
const { buildAccount } = await import("../src/data/records.ts");

const DRAFT = {
  name: "CIB",
  currency: "EGP",
  accountType: "bank",
  institution: "CIB",
  cardEndings: ["0779", "1934"],
  aliases: ["cib"],
  openingBalance: 1500,
  openingDate: "2026-09-01",
  referenceBalance: null,
  active: true,
  includeInNetWorth: true,
};

test("a new account is a note the index can read back", async () => {
  const app = fakeApp();
  const path = await createAccountNote(app, DRAFT);
  assert.equal(path, "Budget/Accounts/CIB.md");

  const note = app.vault.files.get(path)!;
  assert.match(note, /type: account\n/);
  assert.match(note, /card_endings:\n {2}- "0779"\n {2}- "1934"\n/);
  assert.match(note, /opening_balance: 1500\n/);
  assert.match(note, /opening_date: "2026-09-01"\n/);
  // No statement figure was given, so the key is there but empty.
  assert.match(note, /^balance:$/m);
});

test("an empty list and a statement balance are written the way they read back", () => {
  const note = accountNote({ ...DRAFT, cardEndings: [], aliases: [], referenceBalance: 2000 });
  assert.match(note, /card_endings: \[\]\n/);
  assert.match(note, /aliases: \[\]\n/);
  assert.match(note, /^balance: 2000$/m);
});

test("an existing note is never overwritten by a new account", async () => {
  const app = fakeApp();
  await createAccountNote(app, DRAFT);
  app.vault.files.set(accountNotePath("CIB"), "mine");
  await assert.rejects(createAccountNote(app, DRAFT), /already exists/);
  assert.equal(app.vault.files.get(accountNotePath("CIB")), "mine");
});

test("renaming moves the note and the name it carries", async () => {
  const app = fakeApp();
  const path = await createAccountNote(app, DRAFT);
  const moved = await renameAccountNote(app, path, "CIB Current");

  assert.equal(moved, "Budget/Accounts/CIB Current.md");
  assert.equal(app.vault.files.has(path), false);
  assert.match(app.vault.files.get(moved)!, /name: CIB Current/);
  // The body is the user's, heading and all, so it is left as it was.
  assert.match(app.vault.files.get(moved)!, /# CIB\n/);
});

test("renaming onto a name whose file is taken changes nothing", async () => {
  const app = fakeApp();
  const path = await createAccountNote(app, DRAFT);
  await createAccountNote(app, { ...DRAFT, name: "Cash" });

  await assert.rejects(renameAccountNote(app, path, "Cash"), /already exists/);
  assert.match(app.vault.files.get(path)!, /name: "CIB"/);
});

test("an edit rewrites the fields it was given and leaves the rest alone", async () => {
  const app = fakeApp();
  const path = await createAccountNote(app, DRAFT);
  await updateAccountNote(app, path, {
    card_endings: ["4242"],
    opening_balance: -350,
    institution: "CIB Egypt",
  });

  const file = app.vault.getAbstractFileByPath(path)!;
  let frontmatter: Record<string, unknown> = {};
  await app.fileManager.processFrontMatter(file as never, (read) => { frontmatter = { ...read }; });
  const account = buildAccount(frontmatter, path);

  assert.deepEqual(account.cardEndings, ["4242"]);
  assert.equal(account.openingBalance, -350);
  assert.equal(account.institution, "CIB Egypt");
  assert.deepEqual(account.aliases, ["cib"]);
  assert.equal(account.currency, "EGP");
});

test("a closed account is written as false, not dropped", async () => {
  const app = fakeApp();
  const path = await createAccountNote(app, DRAFT);
  await updateAccountNote(app, path, { active: false, include_in_net_worth: false });
  assert.match(app.vault.files.get(path)!, /active: false\n/);
  assert.match(app.vault.files.get(path)!, /include_in_net_worth: false\n/);
});

test("null removes a key, so an account can lose its statement figure", async () => {
  const app = fakeApp();
  const path = await createAccountNote(app, { ...DRAFT, referenceBalance: 2000 });
  await updateAccountNote(app, path, { balance: null, balance_updated_at: null });
  assert.doesNotMatch(app.vault.files.get(path)!, /^balance:/m);
  assert.doesNotMatch(app.vault.files.get(path)!, /^balance_updated_at:/m);
  // The starting balance is a different key and stays where it was.
  assert.match(app.vault.files.get(path)!, /^opening_balance: 1500$/m);
});
