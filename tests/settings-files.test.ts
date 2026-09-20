import test from "node:test";
import assert from "node:assert/strict";
import { stubObsidian } from "./helpers/obsidian-stub.ts";

stubObsidian();

const { fakeApp } = await import("./helpers/fake-app.ts");
const {
  legacyJsonPath,
  loadVaultJson,
  parseSettingsContent,
  resolveSettingsPath,
  saveVaultJson,
  withJsonBlock,
} = await import("../src/data/vault-json.ts");
const { SETTINGS_FILES } = await import("../src/data/settings-files.ts");
const { CONFIG_PATH } = await import("../src/constants.ts");

const note = (body: string) => `# Title\n\nWords about it.\n\n\`\`\`json\n${body}\n\`\`\`\n`;

test("a settings note reads as the data in its json block", () => {
  assert.deepEqual(parseSettingsContent(CONFIG_PATH, note('{\n  "default_currency": "EGP"\n}')), {
    default_currency: "EGP",
  });
});

test("an example fence in the prose is not mistaken for the data", () => {
  const content = [
    "# Accounts",
    "",
    "An entry takes this shape:",
    "",
    "```text",
    '{ "name": "Wallet" }',
    "```",
    "",
    "```json",
    '{ "accounts": [] }',
    "```",
    "",
  ].join("\n");
  assert.deepEqual(parseSettingsContent("Budget/Settings/accounts.md", content), { accounts: [] });
});

test("a note someone stripped the fence from still reads", () => {
  assert.deepEqual(parseSettingsContent(CONFIG_PATH, '{ "default_currency": "USD" }\n'), {
    default_currency: "USD",
  });
});

test("a note with neither a block nor bare json says so by name", async () => {
  const app = fakeApp();
  await app.vault.create("Budget/Settings/config.md", "# Config\n\nI deleted the block.\n");
  await assert.rejects(
    () => loadVaultJson(app, CONFIG_PATH, null),
    /Invalid JSON in Budget\/Settings\/config\.md: it has no ```json block/,
  );
});

test("a legacy .json file is still read where it lies", async () => {
  const app = fakeApp();
  await app.vault.create("Budget/Settings/config.json", '{"default_currency":"AED"}');

  assert.equal(legacyJsonPath(CONFIG_PATH), "Budget/Settings/config.json");
  assert.equal(resolveSettingsPath(app, CONFIG_PATH), "Budget/Settings/config.json");
  assert.deepEqual(await loadVaultJson(app, CONFIG_PATH, null), { default_currency: "AED" });
});

test("the note wins when a vault somehow has both spellings", async () => {
  const app = fakeApp();
  await app.vault.create("Budget/Settings/config.json", '{"default_currency":"AED"}');
  await app.vault.create("Budget/Settings/config.md", note('{"default_currency":"EGP"}'));

  assert.deepEqual(await loadVaultJson(app, CONFIG_PATH, null), { default_currency: "EGP" });
});

test("saving keeps every word around the block", async () => {
  const app = fakeApp();
  await app.vault.create("Budget/Settings/config.md", note('{\n  "default_currency": "EGP"\n}'));

  await saveVaultJson(app, CONFIG_PATH, { default_currency: "SAR" });

  const saved = app.vault.files.get("Budget/Settings/config.md") ?? "";
  assert.match(saved, /^# Title\n\nWords about it\.\n\n```json\n/);
  assert.deepEqual(parseSettingsContent(CONFIG_PATH, saved), { default_currency: "SAR" });
});

test("a save that creates the file writes the words that explain it too", async () => {
  const app = fakeApp();

  await saveVaultJson(app, CONFIG_PATH, { default_currency: "EGP" });

  const saved = app.vault.files.get("Budget/Settings/config.md") ?? "";
  assert.match(saved, /^# Budget config\n/);
  assert.deepEqual(parseSettingsContent(CONFIG_PATH, saved), { default_currency: "EGP" });
});

test("data holding a fence-like string round-trips unharmed", () => {
  const value = { rules: [{ category: "Odd", keywords: ["$&", "```json", "a\\b"] }] };
  const written = withJsonBlock("", JSON.stringify(value, null, 2));
  assert.deepEqual(parseSettingsContent("x.md", written), value);
});

test("every seeded settings file is a note that parses back to its own defaults", () => {
  for (const file of SETTINGS_FILES) {
    assert.ok(file.path.endsWith(".md"), `${file.path} should be a note`);
    const content = `${file.intro}\n${withJsonBlock("", JSON.stringify(file.content, null, 2))}`;
    assert.deepEqual(parseSettingsContent(file.path, content), file.content);
  }
});
