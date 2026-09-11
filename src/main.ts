import { Notice, Plugin, TFile } from "obsidian";
import {
  ACCOUNTS_JSON_PATH,
  CATEGORY_RULES_PATH,
  CONFIG_PATH,
  SETTINGS_DIR,
} from "./constants.ts";
import { TransactionIndex } from "./data/index-store.ts";
import { createRawSmsTransaction, createStructuredTransaction } from "./data/create.ts";
import type { ProtocolParams } from "./data/create.ts";
import { isTransactionPath, toRecordKey } from "./data/records.ts";
import { loadRules, loadVaultJson } from "./data/vault-json.ts";
import { updateTransaction } from "./data/write.ts";
import { resolveExclusion } from "./domain/exclusion.ts";
import { parseSms } from "./domain/parser/sms.ts";
import type { AccountConfig, CategoryRules, SmsPatterns } from "./domain/parser/sms.ts";
import { DEFAULT_SETTINGS, FinanceAutomationSettingTab } from "./settings.ts";
import { FilterStore } from "./store/filter-store.ts";
import { BUDGET_VIEW_TYPE, BudgetView } from "./ui/budget-view.ts";
import { AddTransactionModal } from "./ui/components/add-transaction-modal.ts";
import { CategoryEditorModal } from "./ui/components/category-editor.ts";
import { RulesEditorModal } from "./ui/components/rules-editor.ts";
import { TransactionSheet } from "./ui/components/transaction-sheet.ts";
import type { TransactionRecord } from "./data/types.ts";
import type { FinanceSettings } from "./settings.ts";

const SMS_PATTERNS_PATH = `${SETTINGS_DIR}/sms_patterns.json`;

/** Keys the parser owns outright, overwriting whatever a note already has. */
const PARSER_OWNED = new Set(["status", "parser_confidence", "transaction_id"]);

interface VaultConfig {
  default_currency?: string;
}

export default class FinanceAutomationPlugin extends Plugin {
  override settings: FinanceSettings = { ...DEFAULT_SETTINGS };
  index!: TransactionIndex;
  store!: FilterStore;

  private running = false;
  private queued = false;
  private watchTimer: number | null = null;
  private startupTimer: number | null = null;
  private status: HTMLElement | null = null;
  private processIcon: HTMLElement | null = null;
  /** Stops a frontmatter write of ours from re-triggering its own watcher. */
  private readonly ignoreWatchUntil = new Map<string, number>();

  override async onload(): Promise<void> {
    const data = (await this.loadData()) ?? {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    this.index = new TransactionIndex(this.app);
    this.store = new FilterStore(data.filter ?? null);
    this.status = this.addStatusBarItem();
    this.setStatus("ready");

    this.registerView(BUDGET_VIEW_TYPE, (leaf) => new BudgetView(leaf, this));

    this.addRibbonIcon("wallet", "Open Budget", () => void this.activateBudgetView());

    this.addCommand({
      id: "open-budget-view",
      name: "Open Budget",
      callback: () => void this.activateBudgetView(),
    });

    this.registerObsidianProtocolHandler("finance-sms", async (params) => {
      await this.handleCaptureLink("sms", params as ProtocolParams);
    });
    this.registerObsidianProtocolHandler("finance-transaction", async (params) => {
      await this.handleCaptureLink("transaction", params as ProtocolParams);
    });

    this.processIcon = this.addRibbonIcon("refresh-cw", "Process pending SMS transactions", () => {
      void this.runFinance(true);
    });
    this.processIcon.addClass("finance-automation-process-icon");

    this.addCommand({
      id: "process-transactions",
      name: "Process pending SMS transactions",
      callback: () => void this.runFinance(true),
    });

    this.addCommand({
      id: "add-transaction",
      name: "Add transaction",
      callback: () => this.openAddTransactionModal(),
    });

    this.addCommand({
      id: "edit-categories",
      name: "Edit categories and budgets",
      callback: () => this.openCategoryEditor(),
    });

    this.addCommand({
      id: "edit-exclusion-rules",
      name: "Edit exclusion rules",
      callback: () => new RulesEditorModal(this.app, this).open(),
    });

    this.addCommand({
      id: "apply-exclusion-rules",
      name: "Apply exclusion rules to all transactions",
      callback: async () => {
        const updated = await this.applyRulesToAll();
        new Notice(`Finance: updated ${updated} transaction(s).`);
      },
    });

    this.addSettingTab(new FinanceAutomationSettingTab(this.app, this));

    this.register(() => {
      if (this.watchTimer) window.clearTimeout(this.watchTimer);
      if (this.startupTimer) window.clearTimeout(this.startupTimer);
    });

    // metadataCache is not fully populated before layout is ready, so a build
    // any earlier would see an empty vault.
    this.app.workspace.onLayoutReady(() => {
      this.index.build();
      this.index.registerEvents(this);

      const queueIfTransaction = (file: { path: string } | null) => {
        const ignoredUntil = file ? this.ignoreWatchUntil.get(file.path) ?? 0 : 0;
        if (ignoredUntil && Date.now() >= ignoredUntil) this.ignoreWatchUntil.delete(file!.path);
        if (
          this.settings.watchTransactions &&
          file &&
          isTransactionPath(file.path) &&
          Date.now() >= ignoredUntil
        ) {
          this.queueAutomaticRun();
        }
      };
      this.registerEvent(this.app.vault.on("create", queueIfTransaction));
      this.registerEvent(this.app.vault.on("modify", queueIfTransaction));

      if (this.settings.runOnStartup) {
        this.startupTimer = window.setTimeout(() => void this.runFinance(false), 1500);
      }
    });
  }

  override onunload(): void {
    if (this.watchTimer) window.clearTimeout(this.watchTimer);
    if (this.startupTimer) window.clearTimeout(this.startupTimer);
  }

  async saveSettings(): Promise<void> {
    // Settings live at the top level of plugin data alongside the saved filter,
    // so the whole object is read back before writing.
    const data = (await this.loadData()) ?? {};
    await this.saveData({ ...data, ...this.settings });
  }

  async activateBudgetView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(BUDGET_VIEW_TYPE);
    if (existing.length) {
      await this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    // getLeaf("tab") on desktop, the main area on mobile — both give a full-width pane.
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: BUDGET_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  refreshBudgetView(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(BUDGET_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof BudgetView) view.renderActiveTab();
    }
  }

  showTransactionsTab(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(BUDGET_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof BudgetView) view.showTab("transactions");
    }
  }

  openTransactionSheet(record: TransactionRecord): void {
    new TransactionSheet(this.app, this, record).open();
  }

  openCategoryEditor(): void {
    new CategoryEditorModal(this.app, this).open();
  }

  openAddTransactionModal(): void {
    new AddTransactionModal(this.app, this).open();
  }

  async persistFilter(): Promise<void> {
    const data = (await this.loadData()) ?? {};
    await this.saveData({ ...data, filter: this.store.serialize() });
  }

  private async handleCaptureLink(kind: "sms" | "transaction", params: ProtocolParams): Promise<void> {
    try {
      const file: TFile =
        kind === "sms"
          ? await createRawSmsTransaction(this.app, params, await this.loadPatterns())
          : await createStructuredTransaction(this.app, params);
      new Notice(`Finance: captured ${file.path}.`, 5000);
    } catch (error) {
      console.error("Finance capture link failed", error);
      new Notice(`Finance capture failed: ${(error as Error).message}`, 10000);
    }
  }

  private async loadPatterns(): Promise<SmsPatterns> {
    return loadVaultJson<SmsPatterns>(this.app, SMS_PATTERNS_PATH, {});
  }

  private queueAutomaticRun(): void {
    if (this.running) {
      this.queued = true;
      return;
    }
    if (this.watchTimer) window.clearTimeout(this.watchTimer);
    this.watchTimer = window.setTimeout(() => {
      this.watchTimer = null;
      void this.runFinance(false);
    }, 750);
  }

  private setStatus(value: string): void {
    this.status?.setText(`Finance: ${value}`);
    if (this.processIcon) {
      this.processIcon.toggleClass("is-processing", value === "running…");
      this.processIcon.setAttribute("aria-busy", value === "running…" ? "true" : "false");
    }
  }

  async runFinance(showNotice: boolean): Promise<void> {
    if (this.running) {
      this.queued = true;
      if (showNotice) new Notice("Finance processing is already running; another pass is queued.");
      return;
    }

    this.running = true;
    this.setStatus("running…");
    if (showNotice) new Notice("Finance: processing…");
    try {
      const updated = await this.processPending();
      this.setStatus("ready");
      if (showNotice) new Notice(`Finance: updated ${updated} transaction(s).`, 6000);
    } catch (error) {
      this.setStatus("error");
      console.error("Finance automation failed", error);
      new Notice(`Finance automation failed: ${(error as Error).message}`, 10000);
    } finally {
      this.running = false;
      if (this.queued) {
        this.queued = false;
        window.setTimeout(() => void this.runFinance(false), 500);
      }
    }
  }

  async processPending(): Promise<number> {
    const [config, patterns, accounts, categories] = await Promise.all([
      loadVaultJson<VaultConfig>(this.app, CONFIG_PATH, { default_currency: "EGP" }),
      this.loadPatterns(),
      loadVaultJson<AccountConfig>(this.app, ACCOUNTS_JSON_PATH, { accounts: [] }),
      loadVaultJson<CategoryRules>(this.app, CATEGORY_RULES_PATH, { rules: [] }),
    ]);
    const { rules } = await loadRules(this.app);

    let updated = 0;
    for (const record of this.index.transactions()) {
      const changes: Record<string, unknown> = {};

      const needsParsing = record.status !== "parsed" && Boolean(record.smsMessage);
      if (needsParsing) {
        const parsed = parseSms(record.smsMessage, record.timestamp, config, patterns, accounts, categories);
        // The parser fills only empty fields; anything set by hand wins.
        for (const [key, value] of Object.entries(parsed)) {
          const recordKey = toRecordKey(key);
          if (!recordKey) continue;
          const current = (record as unknown as Record<string, unknown>)[recordKey];
          const isDefault = key === "category" && current === "Uncategorized";
          if (PARSER_OWNED.has(key) || isDefault || current === null || current === "") {
            changes[key] = value;
          }
        }
      }

      if (this.settings.applyExclusionRules) {
        const exclusion = resolveExclusion(record, rules);
        if (exclusion) Object.assign(changes, exclusion);
      }

      if (!Object.keys(changes).length) continue;
      this.ignoreWatchUntil.set(record.path, Date.now() + 2000);
      await updateTransaction(this.app, record.path, changes);
      updated += 1;
    }
    return updated;
  }

  async applyRulesToAll(): Promise<number> {
    const { rules } = await loadRules(this.app);
    let updated = 0;
    for (const record of this.index.transactions()) {
      const exclusion = resolveExclusion(record, rules);
      if (!exclusion) continue;
      this.ignoreWatchUntil.set(record.path, Date.now() + 2000);
      await updateTransaction(this.app, record.path, { ...exclusion });
      updated += 1;
    }
    return updated;
  }
}
