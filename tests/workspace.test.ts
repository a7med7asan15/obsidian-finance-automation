import test from "node:test";
import assert from "node:assert/strict";
import { stubObsidian } from "./helpers/obsidian-stub.ts";

stubObsidian();

const { fakeApp } = await import("./helpers/fake-app.ts");
const { ensureWorkspace, describeWorkspace, planWorkspace } = await import("../src/data/workspace.ts");
const { ingestInbox } = await import("../src/data/inbox.ts");
const { loadVaultJson, saveVaultJson } = await import("../src/data/vault-json.ts");
const { DEFAULT_CATEGORIES } = await import("../src/data/settings-files.ts");
const { CATEGORY_RULES_PATH, CONFIG_PATH, RULES_PATH } = await import("../src/constants.ts");

test("a fresh vault gains every folder, settings note, account and category", async () => {
  const app = fakeApp();

  const result = await ensureWorkspace(app);

  assert.deepEqual(result.replaced, []);
  assert.deepEqual(result.unchanged, []);
  assert.deepEqual(result.created.slice(0, 13), [
    "Budget",
    "Budget/Inbox",
    "Budget/Transactions",
    "Budget/Accounts",
    "Budget/Settings",
    "Budget/Settings/Categories",
    "Budget/Inbox/README.md",
    "Budget/Settings/config.md",
    "Budget/Settings/accounts.md",
    "Budget/Settings/sms_patterns.md",
    "Budget/Settings/exclusion_rules.md",
    "Budget/Settings/type_rules.md",
    "Budget/Settings/Categories/rules.md",
  ]);
  assert.deepEqual(result.created.slice(13, 15), ["Budget/Accounts/Cash.md", "Budget/Accounts/Bank1.md"]);
  for (const category of DEFAULT_CATEGORIES) {
    assert.ok(app.vault.files.has(`Budget/Settings/Categories/${category.name}.md`));
  }
});

test("the settings notes it writes read back as the data they hold", async () => {
  const app = fakeApp();
  await ensureWorkspace(app);

  assert.deepEqual(await loadVaultJson(app, CONFIG_PATH, null), { default_currency: "EGP" });
  assert.deepEqual(await loadVaultJson(app, RULES_PATH, null), { rules: [] });
  const categories = await loadVaultJson<{ rules: Array<{ category: string }> }>(
    app,
    CATEGORY_RULES_PATH,
    { rules: [] },
  );
  assert.deepEqual(
    categories.rules.map((rule) => rule.category),
    DEFAULT_CATEGORIES.map((category) => category.name),
  );
});

test("the seeded account notes carry the card ending the parser matches on", async () => {
  const app = fakeApp();
  await ensureWorkspace(app);

  const cash = app.vault.files.get("Budget/Accounts/Cash.md") ?? "";
  const bank = app.vault.files.get("Budget/Accounts/Bank1.md") ?? "";
  assert.match(cash, /account_type: cash/);
  assert.match(cash, /card_endings: \[\]/);
  assert.match(bank, /card_endings:\n {2}- "1234"/);
});

test("running it a second time changes nothing at all", async () => {
  const app = fakeApp();
  await ensureWorkspace(app);
  const files = new Map(app.vault.files);

  const again = await ensureWorkspace(app);

  assert.deepEqual(again.created, []);
  assert.deepEqual(again.replaced, []);
  assert.ok(again.unchanged.length > 0);
  assert.deepEqual([...app.vault.files], [...files], "an unchanged file is not even rewritten");
  assert.match(describeWorkspace(again), /already in place/);
});

test("a file it owns is put back to the default it was edited away from", async () => {
  const app = fakeApp();
  await ensureWorkspace(app);
  await saveVaultJson(app, CONFIG_PATH, { default_currency: "USD" });
  const bank = "Budget/Accounts/Bank1.md";
  await app.vault.process({ path: bank } as never, () => "---\ntype: account\n---\nmine\n");

  const again = await ensureWorkspace(app);

  assert.deepEqual(await loadVaultJson(app, CONFIG_PATH, null), { default_currency: "EGP" });
  assert.match(app.vault.files.get(bank) ?? "", /card_endings:\n {2}- "1234"/);
  assert.ok(again.replaced.includes("Budget/Settings/config.md"));
  assert.ok(again.replaced.includes(bank));
  assert.equal(describeWorkspace(again), "Budget: reset 2 files to the defaults.");
});

test("it writes the starting accounts and categories even in a vault already in use", async () => {
  const app = fakeApp();
  await app.vault.createFolder("Budget");
  await app.vault.createFolder("Budget/Accounts");
  await app.vault.create("Budget/Accounts/CIB Visa.md", "---\ntype: account\n---\n");
  await app.vault.createFolder("Budget/Settings");
  await app.vault.createFolder("Budget/Settings/Categories");
  await app.vault.create("Budget/Settings/Categories/Coffee.md", "---\ntype: category\n---\n");

  await ensureWorkspace(app);

  assert.ok(app.vault.files.has("Budget/Accounts/Bank1.md"));
  assert.ok(app.vault.files.has("Budget/Settings/Categories/Groceries.md"));
  // Notes it does not own keep whatever they hold.
  assert.equal(app.vault.files.get("Budget/Accounts/CIB Visa.md"), "---\ntype: account\n---\n");
  assert.equal(app.vault.files.get("Budget/Settings/Categories/Coffee.md"), "---\ntype: category\n---\n");
});

test("the notice names the tree on a fresh vault and the gap on a partial one", async () => {
  const fresh = fakeApp();
  assert.match(describeWorkspace(await ensureWorkspace(fresh)), /^Budget: created Budget\/ —/);

  const partial = fakeApp();
  await ensureWorkspace(partial);
  partial.vault.folders.delete("Budget/Accounts");
  assert.equal(
    describeWorkspace(await ensureWorkspace(partial)),
    "Budget: created Budget/Accounts.",
  );
});

test("a transaction is never touched, whatever the command does", async () => {
  const app = fakeApp();
  await app.vault.createFolder("Budget");
  await app.vault.createFolder("Budget/Transactions");
  await app.vault.create("Budget/Transactions/2026/Sep/19T10-00-00.md", "my transaction\n");

  await ensureWorkspace(app);

  assert.equal(app.vault.files.get("Budget/Transactions/2026/Sep/19T10-00-00.md"), "my transaction\n");
});

test("a vault whose settings are still .json is reset in place, with no .md twin", async () => {
  const app = fakeApp();
  await app.vault.createFolder("Budget");
  await app.vault.createFolder("Budget/Settings");
  await app.vault.create("Budget/Settings/config.json", '{"default_currency":"USD"}\n');

  const result = await ensureWorkspace(app);

  assert.ok(!app.vault.files.has("Budget/Settings/config.md"));
  assert.ok(result.replaced.includes("Budget/Settings/config.json"));
  assert.equal(app.vault.files.get("Budget/Settings/config.json"), '{\n  "default_currency": "EGP"\n}\n');
  assert.deepEqual(await loadVaultJson(app, CONFIG_PATH, null), { default_currency: "EGP" });
});

test("the README it writes is never ingested as a message", async () => {
  const app = fakeApp();
  await ensureWorkspace(app);

  const result = await ingestInbox(app);

  assert.deepEqual(result, { created: [], empty: [], ignored: [], failed: [] });
  assert.ok(app.vault.files.has("Budget/Inbox/README.md"));
});

test("the plan of a fresh vault has everything to make and nothing to lose", async () => {
  const app = fakeApp();

  const plan = await planWorkspace(app);

  assert.deepEqual(plan.reset, []);
  assert.deepEqual(plan.folders, [
    "Budget",
    "Budget/Inbox",
    "Budget/Transactions",
    "Budget/Accounts",
    "Budget/Settings",
    "Budget/Settings/Categories",
  ]);
  assert.equal(plan.create.length, 17);
});

test("the plan names every edited file, and nothing that is already the default", async () => {
  const app = fakeApp();
  await ensureWorkspace(app);
  await saveVaultJson(app, CONFIG_PATH, { default_currency: "USD" });

  const plan = await planWorkspace(app);

  assert.deepEqual(plan.reset, ["Budget/Settings/config.md"]);
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.folders, []);
});

test("the plan says what the run then does, exactly", async () => {
  const app = fakeApp();
  await ensureWorkspace(app);
  await saveVaultJson(app, CONFIG_PATH, { default_currency: "USD" });
  app.vault.files.delete("Budget/Accounts/Cash.md");

  const plan = await planWorkspace(app);
  const result = await ensureWorkspace(app);

  assert.deepEqual(result.replaced, plan.reset);
  assert.deepEqual(result.created, plan.create);
});
