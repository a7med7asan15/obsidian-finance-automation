const assert = require("assert");
const Module = require("module");
const path = require("path");

class MockFile {
  constructor(filePath) {
    this.path = filePath;
  }
}

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "obsidian") {
    return {
      Plugin: class {},
      PluginSettingTab: class {},
      Setting: class {},
      Notice: class {},
      TFile: MockFile,
      TFolder: class {},
      parseYaml: () => ({}),
      normalizePath: (value) => value.replace(/^\/+|\/+$/g, ""),
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const FinanceAutomation = require(path.resolve(__dirname, "../main.js"));

async function main() {
  const plugin = new FinanceAutomation();
  const written = new Map();
  plugin.app = {
    vault: {
      getAbstractFileByPath(filePath) {
        return written.has(filePath) ? new MockFile(filePath) : null;
      },
    },
  };
  plugin.writeVaultFile = async (filePath, content) => written.set(filePath, content);

  const raw = await plugin.createRawSmsTransaction({
    message: "Card 1234 purchase amount EGP 120.50 at Carrefour",
    timestamp: "2026-08-29T14:35:02+03:00",
  });
  assert.strictEqual(raw.path, "Transactions/2026/Aug/29T14-35-02.md");
  assert.match(written.get(raw.path), /status: pending/);
  assert.match(written.get(raw.path), /source: iphone-shortcut-sms/);

  const duplicate = await plugin.createRawSmsTransaction({
    message: "Another SMS",
    timestamp: "2026-08-29T14:35:02+03:00",
  });
  assert.strictEqual(duplicate.path, "Transactions/2026/Aug/29T14-35-02-2.md");

  const structured = await plugin.createStructuredTransaction({
    amount: "1,200.50",
    currency: "egp",
    account: "Salary account",
    type: "credit",
    merchant: "Employer",
    timestamp: "2026-08-29T14:36:02+03:00",
  });
  const structuredText = written.get(structured.path);
  assert.match(structuredText, /amount: 1200\.5/);
  assert.match(structuredText, /currency: "EGP"/);
  assert.match(structuredText, /to_account: "Salary account"/);
  assert.match(structuredText, /transaction_type: "credit"/);
  assert.match(structuredText, /status: parsed/);
  assert.match(structuredText, /source: iphone-shortcut-fields/);

  const invalid = await plugin.createStructuredTransaction({
    amount: "20",
    currency: "EGP",
    account: "Cash",
    type: "expense",
  });
  assert.match(written.get(invalid.path), /status: needs_review/);

  await assert.rejects(() => plugin.createRawSmsTransaction({}), /message parameter is empty/);
  console.log("Capture-link tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
