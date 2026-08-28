const { Plugin, PluginSettingTab, Setting, Notice, TFile, TFolder, parseYaml, normalizePath } = require("obsidian");

const DEFAULT_SETTINGS = {
  runOnStartup: true,
  watchTransactions: true,
};

function makeRegex(pattern) {
  const javascriptPattern = pattern
    .replace(/^\(\?i\)/, "")
    .replace(/\(\?P<([A-Za-z_][A-Za-z0-9_]*)>/g, "(?<$1>");
  return new RegExp(javascriptPattern, "iu");
}

function extractByPatterns(text, patterns) {
  for (const pattern of patterns || []) {
    try {
      const match = text.match(makeRegex(pattern));
      if (match) return match;
    } catch (error) {
      throw new Error(`Invalid SMS pattern ${pattern}: ${error.message}`);
    }
  }
  return null;
}

function hasKeyword(text, keywords) {
  const folded = text.toLocaleLowerCase();
  return (keywords || []).some((word) => folded.includes(String(word).toLocaleLowerCase()));
}

function normalizeCurrency(value, fallback) {
  if (!value) return fallback || "";
  const clean = String(value).toUpperCase().replaceAll(" ", "").replaceAll(".", "");
  return clean === "جم" || clean === "جـم" ? "EGP" : clean;
}

function stableId(text) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return first.toString(16).padStart(8, "0") + second.toString(16).padStart(8, "0");
}

function originalSms(properties, content) {
  if (properties.sms_message) return String(properties.sms_message).trim();
  const match = content.match(/## Original SMS\s*\n+```(?:text)?\s*\n([\s\S]*?)\n```/i);
  if (!match) return "";
  const sms = match[1].trim();
  return sms.toLocaleLowerCase().startsWith("paste the complete sms") ? "" : sms;
}

module.exports = class FinanceAutomationPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.running = false;
    this.queued = false;
    this.watchTimer = null;
    this.startupTimer = null;
    this.ignoreWatchUntil = new Map();
    this.status = this.addStatusBarItem();
    this.setStatus("ready");

    this.processIcon = this.addRibbonIcon("refresh-cw", "Process transactions and refresh statistics", () => {
      this.runFinance("all", true);
    });
    this.processIcon.addClass("finance-automation-process-icon");

    this.addCommand({
      id: "process-transactions",
      name: "Process pending SMS transactions",
      callback: () => this.runFinance("process", true),
    });
    this.addCommand({
      id: "refresh-statistics",
      name: "Refresh statistics",
      callback: () => this.runFinance("stats", true),
    });
    this.addCommand({
      id: "process-and-refresh",
      name: "Process transactions and refresh statistics",
      callback: () => this.runFinance("all", true),
    });

    this.addSettingTab(new FinanceAutomationSettingTab(this.app, this));

    this.register(() => {
      if (this.watchTimer) clearTimeout(this.watchTimer);
      if (this.startupTimer) clearTimeout(this.startupTimer);
    });

    this.app.workspace.onLayoutReady(() => {
      const queueIfTransaction = (file) => {
        const ignoredUntil = file ? this.ignoreWatchUntil.get(file.path) || 0 : 0;
        if (ignoredUntil && Date.now() >= ignoredUntil) this.ignoreWatchUntil.delete(file.path);
        if (
          this.settings.watchTransactions &&
          file &&
          this.isTransactionNote(file.path) &&
          Date.now() >= ignoredUntil
        ) {
          this.queueAutomaticRun();
        }
      };
      this.registerEvent(this.app.vault.on("create", queueIfTransaction));
      this.registerEvent(this.app.vault.on("modify", queueIfTransaction));
      if (this.settings.runOnStartup) {
        this.startupTimer = setTimeout(() => this.runFinance("all", false), 1500);
      }
    });
  }

  onunload() {
    if (this.watchTimer) clearTimeout(this.watchTimer);
    if (this.startupTimer) clearTimeout(this.startupTimer);
  }

  isTransactionNote(vaultPath) {
    return vaultPath.startsWith("Transactions/") && vaultPath.endsWith(".md") && vaultPath !== "Transactions/README.md";
  }

  queueAutomaticRun() {
    if (this.running) {
      this.queued = true;
      return;
    }
    if (this.watchTimer) clearTimeout(this.watchTimer);
    this.watchTimer = setTimeout(() => {
      this.watchTimer = null;
      this.runFinance("all", false);
    }, 750);
  }

  setStatus(value) {
    if (this.status) this.status.setText(`Finance: ${value}`);
    if (this.processIcon) {
      this.processIcon.toggleClass("is-processing", value === "running…");
      this.processIcon.setAttribute("aria-busy", value === "running…" ? "true" : "false");
    }
  }

  async runFinance(command, showNotice) {
    if (this.running) {
      this.queued = true;
      if (showNotice) new Notice("Finance processing is already running; another pass is queued.");
      return;
    }

    this.running = true;
    this.setStatus("running…");
    if (showNotice) new Notice(`Finance: running ${command}…`);
    try {
      const output = await this.runJavaScript(command);
      const lines = output.trim().split(/\r?\n/).filter(Boolean);
      const summary = lines[lines.length - 1] || "Completed successfully.";
      this.setStatus("ready");
      if (showNotice) new Notice(`Finance: ${summary}`, 6000);
    } catch (error) {
      this.setStatus("error");
      console.error("Finance automation failed", error);
      new Notice(`Finance automation failed: ${error.message}`, 10000);
    } finally {
      this.running = false;
      if (this.queued) {
        this.queued = false;
        setTimeout(() => this.runFinance("all", false), 500);
      }
    }
  }

  async loadVaultJson(vaultPath, fallback) {
    const file = this.app.vault.getAbstractFileByPath(vaultPath);
    if (!(file instanceof TFile)) return fallback;
    try {
      return JSON.parse(await this.app.vault.cachedRead(file));
    } catch (error) {
      throw new Error(`Invalid JSON in ${vaultPath}: ${error.message}`);
    }
  }

  propertiesFrom(content, file) {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (match) {
      try {
        return parseYaml(match[1]) || {};
      } catch (_error) {
        // Fall through to Obsidian's metadata cache.
      }
    }
    return this.app.metadataCache.getFileCache(file)?.frontmatter || {};
  }

  accountCandidates(sms, ending, accounts) {
    const folded = sms.toLocaleLowerCase();
    const found = [];
    for (const account of accounts || []) {
      const name = String(account.name || "").trim();
      const endings = (account.card_endings || []).map(String);
      const aliases = [name, ...(account.aliases || [])];
      const matchesAlias = aliases.some((alias) => {
        const clean = String(alias).trim().toLocaleLowerCase();
        return clean.length >= 3 && folded.includes(clean);
      });
      if (name && ((ending && endings.includes(ending)) || matchesAlias) && !found.includes(name)) {
        found.push(name);
      }
    }
    if (!found.length && ending) found.push(`Card ••••${ending}`);
    return found;
  }

  parseTransactionSms(sms, properties, config, patterns, accountConfig, categoryConfig) {
    const amountMatch = extractByPatterns(sms, patterns.amount_patterns);
    const amountText = amountMatch?.groups?.amount?.replaceAll(",", "");
    const amount = amountText && Number.isFinite(Number(amountText)) ? Number(amountText) : null;
    const currencyText = amountMatch?.groups?.currency1 || amountMatch?.groups?.currency2;
    const currency = normalizeCurrency(currencyText, amount !== null ? (config.default_currency || "EGP") : "");

    const endingMatch = extractByPatterns(sms, patterns.card_ending_patterns);
    const ending = endingMatch?.groups?.ending || "";
    const accounts = this.accountCandidates(sms, ending, accountConfig.accounts);
    const merchantMatch = extractByPatterns(sms, patterns.merchant_patterns);
    const merchant = merchantMatch?.[1]?.trim() || "";

    const isTransfer = hasKeyword(sms, patterns.transfer_keywords);
    const isFee = hasKeyword(sms, patterns.fee_keywords);
    const isCredit = hasKeyword(sms, patterns.credit_keywords);
    const isDebit = hasKeyword(sms, patterns.debit_keywords);
    let transactionType = "";
    if (isTransfer) transactionType = "transfer";
    else if (isFee && !isCredit) transactionType = "fee";
    else if (isCredit && !isDebit) transactionType = "credit";
    else if (isDebit && !isCredit) transactionType = "debit";

    let fromAccount = "";
    let toAccount = "";
    if (["debit", "fee"].includes(transactionType) && accounts.length) fromAccount = accounts[0];
    else if (transactionType === "credit" && accounts.length) toAccount = accounts[0];
    else if (transactionType === "transfer") {
      fromAccount = accounts[0] || "";
      toAccount = accounts[1] || "";
    }

    let category = "Uncategorized";
    const categoryText = `${sms}\n${merchant}`.toLocaleLowerCase();
    for (const rule of categoryConfig.rules || []) {
      if ((rule.keywords || []).some((word) => categoryText.includes(String(word).toLocaleLowerCase()))) {
        category = rule.category || category;
        break;
      }
    }
    if (transactionType === "fee") category = "Fees";
    else if (transactionType === "transfer" && category === "Uncategorized") category = "Transfer";

    const checks = [amount !== null, Boolean(currency), Boolean(transactionType), Boolean(accounts.length)];
    if (category !== "Uncategorized") checks.push(true);
    const confidence = Math.round((checks.filter(Boolean).length / checks.length) * 100) / 100;
    const complete = amount !== null && currency && transactionType && (fromAccount || toAccount);
    const fingerprint = `${sms.trim().toLocaleLowerCase().replace(/\s+/g, " ")}|${properties.timestamp || ""}`;

    return {
      amount,
      currency,
      from_account: fromAccount,
      to_account: toAccount,
      category,
      merchant,
      transaction_type: transactionType,
      status: complete ? "parsed" : "needs_review",
      parser_confidence: confidence,
      transaction_id: stableId(fingerprint),
    };
  }

  async processWithJavaScript() {
    const [config, patterns, accounts, categories] = await Promise.all([
      this.loadVaultJson("Settings/config.json", { default_currency: "EGP" }),
      this.loadVaultJson("Settings/sms_patterns.json", {}),
      this.loadVaultJson("Settings/accounts.json", { accounts: [] }),
      this.loadVaultJson("Settings/Categories/rules.json", { rules: [] }),
    ]);
    const files = this.app.vault.getMarkdownFiles().filter((file) => this.isTransactionNote(file.path));
    let updated = 0;
    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      const properties = this.propertiesFrom(content, file);
      if (properties.type !== "transaction" || ![null, undefined, "", "pending", "needs_review"].includes(properties.status)) continue;
      const sms = originalSms(properties, content);
      if (!sms) continue;
      const parsed = this.parseTransactionSms(sms, properties, config, patterns, accounts, categories);
      const changes = {};
      for (const [key, value] of Object.entries(parsed)) {
        const current = properties[key];
        const isDefault = key === "category" && current === "Uncategorized";
        const parserOwned = ["status", "parser_confidence", "transaction_id"].includes(key);
        const canWrite = current === null || current === undefined || current === "" || isDefault || parserOwned;
        if (canWrite && JSON.stringify(current) !== JSON.stringify(value)) changes[key] = value;
      }
      if (!Object.keys(changes).length) continue;

      // Obsidian emits a modify event for our frontmatter update. Ignore that event so
      // a needs-review transaction cannot continuously queue itself.
      this.ignoreWatchUntil.set(file.path, Date.now() + 2000);
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        for (const [key, value] of Object.entries(changes)) frontmatter[key] = value;
      });
      updated += 1;
    }
    return updated;
  }

  numberValue(value) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(String(value).replaceAll(",", ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  money(value) {
    return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  markdownText(value) {
    return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
  }

  csvCell(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  async ensureFolder(vaultPath) {
    const normalized = normalizePath(vaultPath);
    if (!normalized || normalized === "/") return;
    let current = "";
    for (const part of normalized.split("/")) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (!existing) await this.app.vault.createFolder(current);
      else if (!(existing instanceof TFolder)) throw new Error(`${current} exists but is not a folder.`);
    }
  }

  async writeVaultFile(vaultPath, content) {
    const normalized = normalizePath(vaultPath);
    const slash = normalized.lastIndexOf("/");
    if (slash > 0) await this.ensureFolder(normalized.slice(0, slash));
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFile) {
      await this.app.vault.process(existing, () => content);
    } else if (existing) {
      throw new Error(`${normalized} exists but is not a file.`);
    } else {
      await this.app.vault.create(normalized, content);
    }
  }

  addGroupedAmount(map, keys, amount) {
    const key = JSON.stringify(keys);
    map.set(key, (map.get(key) || 0) + amount);
  }

  cairoMonth() {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Africa/Cairo",
        year: "numeric",
        month: "2-digit",
      }).formatToParts(new Date());
      const year = parts.find((part) => part.type === "year")?.value;
      const month = parts.find((part) => part.type === "month")?.value;
      return `${year}-${month}`;
    } catch (_error) {
      return new Date().toISOString().slice(0, 7);
    }
  }

  async generateStatsWithJavaScript() {
    const config = await this.loadVaultJson("Settings/config.json", {});
    const statsDirectory = config.stats_directory || "Stats";
    const accountDirectory = `${config.accounts_directory || "Accounts"}/`;
    const transactionFiles = this.app.vault.getMarkdownFiles().filter((file) => this.isTransactionNote(file.path));
    const records = [];
    const review = [];
    const duplicates = [];
    const seenIds = new Map();

    for (const file of transactionFiles) {
      const properties = this.propertiesFrom(await this.app.vault.cachedRead(file), file);
      if (properties.type !== "transaction") continue;
      const record = { ...properties, _path: file.path };
      records.push(record);
      const missing = ["amount", "currency", "transaction_type"].filter(
        (key) => properties[key] === null || properties[key] === undefined || properties[key] === ""
      );
      if (properties.status !== "parsed" || missing.length) review.push({ record, missing });
      const id = String(properties.transaction_id || "");
      if (id) {
        if (seenIds.has(id)) duplicates.push([file.path, seenIds.get(id)]);
        else seenIds.set(id, file.path);
      }
    }

    const csvFields = [
      "timestamp", "amount", "currency", "transaction_type", "from_account", "to_account",
      "merchant", "category", "status", "source", "transaction_id", "file",
    ];
    const csvLines = [csvFields.join(",")];
    for (const record of records) {
      const row = csvFields.map((field) => this.csvCell(field === "file" ? record._path : record[field]));
      csvLines.push(row.join(","));
    }

    const accountRows = [];
    const netWorth = new Map();
    for (const file of this.app.vault.getMarkdownFiles().filter((item) => item.path.startsWith(accountDirectory))) {
      const properties = this.propertiesFrom(await this.app.vault.cachedRead(file), file);
      if (properties.type !== "account" || properties.active === false) continue;
      const balance = this.numberValue(properties.balance);
      if (balance === null) continue;
      const currency = String(properties.currency || "Unknown");
      const name = String(properties.name || file.basename);
      accountRows.push({ currency, name, balance, path: file.path });
      if (properties.include_in_net_worth !== false) netWorth.set(currency, (netWorth.get(currency) || 0) + balance);
    }

    const monthly = new Map();
    const categories = new Map();
    const monthlyCategories = new Map();
    const accountFlows = new Map();
    for (const record of records) {
      const amount = this.numberValue(record.amount);
      if (amount === null) continue;
      const timestamp = String(record.timestamp || record._path.split("/").pop());
      const month = /^\d{4}-\d{2}/.test(timestamp) ? timestamp.slice(0, 7) : "Unknown";
      const currency = String(record.currency || "Unknown");
      const type = String(record.transaction_type || "unknown");
      const monthKey = JSON.stringify([month, currency]);
      const bucket = monthly.get(monthKey) || { income: 0, expenses: 0, transfers: 0, count: 0 };
      bucket.count += 1;
      if (type === "credit") bucket.income += amount;
      else if (["debit", "fee"].includes(type)) {
        bucket.expenses += amount;
        const category = String(record.category || "Uncategorized");
        this.addGroupedAmount(categories, [currency, category], amount);
        this.addGroupedAmount(monthlyCategories, [month, currency, category], amount);
      } else if (type === "transfer") bucket.transfers += amount;
      monthly.set(monthKey, bucket);
      if (record.from_account) this.addGroupedAmount(accountFlows, [currency, String(record.from_account)], -amount);
      if (record.to_account) this.addGroupedAmount(accountFlows, [currency, String(record.to_account)], amount);
    }

    const generated = new Date().toISOString();
    const lines = [
      "# Finance Summary", "", `Generated: \`${generated}\``, "",
      "Currencies are reported separately; no exchange-rate conversion is assumed.", "", "## Account balances", "",
    ];
    if (accountRows.length) {
      lines.push("| Currency | Account | Balance |", "|---|---|---:|");
      accountRows.sort((a, b) => `${a.currency}\t${a.name}`.localeCompare(`${b.currency}\t${b.name}`));
      for (const row of accountRows) {
        const link = row.path.replace(/\.md$/, "");
        lines.push(`| ${this.markdownText(row.currency)} | [[${link}|${this.markdownText(row.name)}]] | ${this.money(row.balance)} |`);
      }
      lines.push("", "### Net worth by currency", "", "| Currency | Net worth |", "|---|---:|");
      for (const [currency, balance] of [...netWorth].sort()) lines.push(`| ${this.markdownText(currency)} | ${this.money(balance)} |`);
    } else lines.push("No account notes with balances yet.");

    lines.push("", "## Monthly totals", "");
    if (monthly.size) {
      lines.push("| Month | Currency | Income | Expenses | Transfers | Net cash flow | Count |", "|---|---:|---:|---:|---:|---:|---:|");
      const entries = [...monthly].map(([key, value]) => ({ keys: JSON.parse(key), value }));
      entries.sort((a, b) => b.keys[0].localeCompare(a.keys[0]) || a.keys[1].localeCompare(b.keys[1]));
      for (const { keys: [month, currency], value } of entries) {
        lines.push(`| ${month} | ${this.markdownText(currency)} | ${this.money(value.income)} | ${this.money(value.expenses)} | ${this.money(value.transfers)} | ${this.money(value.income - value.expenses)} | ${value.count} |`);
      }
    } else lines.push("No parsed transactions yet.");

    lines.push("", "## Expense categories", "");
    if (categories.size) {
      lines.push("| Currency | Category | Spent |", "|---|---|---:|");
      const entries = [...categories].map(([key, amount]) => ({ keys: JSON.parse(key), amount }));
      entries.sort((a, b) => a.keys[0].localeCompare(b.keys[0]) || b.amount - a.amount);
      for (const { keys: [currency, category], amount } of entries) {
        lines.push(`| ${this.markdownText(currency)} | ${this.markdownText(category)} | ${this.money(amount)} |`);
      }
    } else lines.push("No categorized expenses yet.");

    const budgets = [];
    for (const file of this.app.vault.getMarkdownFiles().filter((item) => item.path.startsWith("Settings/Categories/"))) {
      const properties = this.propertiesFrom(await this.app.vault.cachedRead(file), file);
      const budget = this.numberValue(properties.monthly_budget);
      if (properties.type === "category" && budget !== null) {
        budgets.push({
          currency: String(properties.currency || config.default_currency || "EGP"),
          category: String(properties.name || file.basename),
          budget,
        });
      }
    }
    lines.push("", "## Current-month budgets", "");
    if (budgets.length) {
      lines.push("| Currency | Category | Budget | Spent | Remaining |", "|---|---|---:|---:|---:|");
      const currentMonth = this.cairoMonth();
      for (const item of budgets.sort((a, b) => a.category.localeCompare(b.category))) {
        const spent = monthlyCategories.get(JSON.stringify([currentMonth, item.currency, item.category])) || 0;
        lines.push(`| ${this.markdownText(item.currency)} | ${this.markdownText(item.category)} | ${this.money(item.budget)} | ${this.money(spent)} | ${this.money(item.budget - spent)} |`);
      }
    } else lines.push("Set `monthly_budget` in category notes to enable budget tracking.");

    lines.push("", "## Account flow from recorded transactions", "");
    if (accountFlows.size) {
      lines.push("| Currency | Account | Net flow |", "|---|---|---:|");
      const entries = [...accountFlows].map(([key, amount]) => ({ keys: JSON.parse(key), amount }));
      entries.sort((a, b) => `${a.keys[0]}\t${a.keys[1]}`.localeCompare(`${b.keys[0]}\t${b.keys[1]}`));
      for (const { keys: [currency, account], amount } of entries) {
        lines.push(`| ${this.markdownText(currency)} | ${this.markdownText(account)} | ${this.money(amount)} |`);
      }
    } else lines.push("No account flows yet.");

    const reviewLines = ["# Needs Review", "", `Generated: \`${generated}\``, ""];
    if (review.length) {
      for (const { record, missing } of review) {
        const link = record._path.replace(/\.md$/, "");
        const reason = missing.length ? `missing ${missing.join(", ")}` : String(record.status || "needs_review");
        reviewLines.push(`- [[${link}]] — ${reason}`);
      }
    } else reviewLines.push("All transactions are parsed.");
    if (duplicates.length) {
      reviewLines.push("", "## Possible duplicates", "");
      for (const [duplicate, original] of duplicates) {
        reviewLines.push(`- [[${duplicate.replace(/\.md$/, "")}]] duplicates [[${original.replace(/\.md$/, "")}]]`);
      }
    }

    await this.writeVaultFile(`${statsDirectory}/Summary.md`, `${lines.join("\n")}\n`);
    await this.writeVaultFile(`${statsDirectory}/Needs Review.md`, `${reviewLines.join("\n")}\n`);
    await this.writeVaultFile(`${statsDirectory}/transactions.csv`, `${csvLines.join("\n")}\n`);
    return records.length;
  }

  async runJavaScript(command) {
    let updated = 0;
    let records = null;
    if (command === "process" || command === "all") updated = await this.processWithJavaScript();
    if (command === "stats" || command === "all") records = await this.generateStatsWithJavaScript();
    const parts = [];
    if (command !== "stats") parts.push(`updated ${updated} transaction(s)`);
    if (records !== null) parts.push(`generated reports from ${records} transaction(s)`);
    return `${parts.join(" and ")}.`;
  }
};

class FinanceAutomationSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Finance automation" });

    containerEl.createEl("p", {
      text: "The same local JavaScript processor runs on desktop and mobile and refreshes all reports.",
    });

    new Setting(containerEl)
      .setName("Process when Obsidian starts")
      .setDesc("Process pending notes and refresh reports after opening the vault.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.runOnStartup).onChange(async (value) => {
          this.plugin.settings.runOnStartup = value;
          await this.plugin.saveData(this.plugin.settings);
        })
      );

    new Setting(containerEl)
      .setName("Watch transaction notes")
      .setDesc("Run automatically shortly after a transaction note is created or changed.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.watchTransactions).onChange(async (value) => {
          this.plugin.settings.watchTransactions = value;
          await this.plugin.saveData(this.plugin.settings);
        })
      );
  }
}
