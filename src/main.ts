import { Notice, Plugin, normalizePath } from "obsidian";
import {
  ACCOUNTS_CONFIG_PATH,
  CATEGORY_RULES_PATH,
  CONFIG_PATH,
  INBOX_DIR,
  SMS_PATTERNS_PATH,
} from "./constants.ts";
import { registerFinanceCodeBlock } from "./codeblock.ts";
import { TransactionIndex } from "./data/index-store.ts";
import { createCategoryNote } from "./data/categories.ts";
import { createStructuredTransaction } from "./data/create.ts";
import type { ProtocolParams } from "./data/create.ts";
import { describeInbox, ingestInbox } from "./data/inbox.ts";
import { setUpWorkspace } from "./ui/workspace-setup.ts";
import { isTransactionPath, parserChanges } from "./data/records.ts";
import { applyFilter } from "./domain/filter.ts";
import { cairoToday, periodLabel } from "./domain/dates.ts";
import { exportCsv } from "./ui/export-csv.ts";
import { loadRules, loadVaultJson } from "./data/vault-json.ts";
import { updateTransaction } from "./data/write.ts";
import { resolveExclusion } from "./domain/exclusion.ts";
import { isPlaceholderAccount, mergeAccountSources, parseSms } from "./domain/parser/sms.ts";
import { counterpartyFields, readCounterparty } from "./domain/counterparty.ts";
import { sameName } from "./domain/names.ts";
import { withDefaultPatterns } from "./domain/parser/defaults.ts";
import type { AccountConfig, CategoryRules, SmsPatterns } from "./domain/parser/sms.ts";
import { DEFAULT_SETTINGS, FinanceAutomationSettingTab } from "./settings.ts";
import { FilterStore } from "./store/filter-store.ts";
import { BUDGET_VIEW_TYPE, BudgetView } from "./ui/budget-view.ts";
import type { BudgetTab } from "./ui/budget-view.ts";
import { AddTransactionModal } from "./ui/components/add-transaction-modal.ts";
import { RulesEditorModal } from "./ui/components/rules-editor.ts";
import { TransactionSheet } from "./ui/components/transaction-sheet.ts";
import type { Filter, TransactionRecord } from "./data/types.ts";
import type { FinanceSettings } from "./settings.ts";


interface VaultConfig {
  default_currency?: string;
}

/**
 * What `loadData` gives back: the settings, plus the filter the Budget view
 * was last left on. `loadData` is typed `any`, so the shape is asserted once
 * here rather than spreading unchecked values through onload.
 */
interface PluginData extends Partial<FinanceSettings> {
  filter?: Partial<Filter> | null;
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
    const data = ((await this.loadData()) as PluginData | null) ?? {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    this.index = new TransactionIndex(this.app);
    this.store = new FilterStore(data.filter ?? null);
    this.status = this.addStatusBarItem();
    this.setStatus("ready");

    this.registerView(BUDGET_VIEW_TYPE, (leaf) => new BudgetView(leaf, this));
    registerFinanceCodeBlock(this);

    this.addRibbonIcon("wallet", "Open budget", () => void this.activateBudgetView());

    this.addCommand({
      id: "open-budget-view",
      name: "Open budget",
      callback: () => void this.activateBudgetView(),
    });

    // Bank messages come in through Budget/Inbox instead of a link: a file has
    // no length ceiling, and it survives the app being closed. This link covers
    // the other case only — the tap-to-fill Shortcut for cash and anything with
    // no SMS behind it.
    this.registerObsidianProtocolHandler("finance-transaction", async (params) => {
      await this.handleCaptureLink(params);
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
      id: "create-budget-folders",
      name: "Create budget folders",
      callback: () => void setUpWorkspace(this.app),
    });

    this.addCommand({
      id: "import-sms-inbox",
      name: "Import messages from the SMS inbox",
      callback: async () => {
        const captured = await this.captureInbox();
        if (captured) void this.runFinance(false);
        else if (!(await this.app.vault.adapter.exists(normalizePath(INBOX_DIR)))) {
          new Notice(
            `Budget: ${INBOX_DIR} does not exist yet. Run "Create budget folders" first.`,
            8000,
          );
        } else new Notice(`Budget: no messages waiting in ${INBOX_DIR}.`);
      },
    });

    this.addCommand({
      id: "add-transaction",
      name: "Add transaction",
      callback: () => this.openAddTransactionModal(),
    });

    this.addCommand({
      id: "export-transactions-csv",
      name: "Export filtered transactions as CSV",
      callback: async () => {
        const records = applyFilter(this.index.transactions(), this.store.get(), cairoToday());
        const path = await exportCsv(this.app, records, periodLabel(this.store.get().period));
        new Notice(`Exported ${records.length} transactions to ${path}.`);
      },
    });

    this.addCommand({
      id: "fill-counterparties",
      name: "Fill in missing merchants from stored messages",
      callback: async () => {
        const updated = await this.fillMissingCounterparties();
        new Notice(`Budget: named the other side of ${updated} transaction(s).`, 6000);
      },
    });

    this.addCommand({
      id: "list-merchants",
      name: "List merchants, recipients and senders",
      callback: () => void this.activateBudgetView().then(() => this.showBudgetTab("merchants")),
    });

    this.addCommand({
      id: "edit-categories",
      name: "Edit categories and budgets",
      callback: () => this.showCategoriesTab(),
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
        new Notice(`Budget: updated ${updated} transaction(s).`);
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

      // A message that landed while the app was closed is read at startup even
      // when automatic processing is off: the inbox is how a capture arrives,
      // not a form of processing. Parsing it is the only thing that makes it a
      // transaction, so a capture earns a pass of its own either way.
      this.startupTimer = window.setTimeout(() => void (async () => {
        const captured = await this.captureInbox();
        if (this.settings.runOnStartup || captured) await this.runFinance(false);
      })(), 1500);
    });
  }

  override onunload(): void {
    if (this.watchTimer) window.clearTimeout(this.watchTimer);
    if (this.startupTimer) window.clearTimeout(this.startupTimer);
  }

  async saveSettings(): Promise<void> {
    // Settings live at the top level of plugin data alongside the saved filter,
    // so the whole object is read back before writing.
    const data = ((await this.loadData()) as PluginData | null) ?? {};
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

  showBudgetTab(tab: BudgetTab): void {
    for (const leaf of this.app.workspace.getLeavesOfType(BUDGET_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof BudgetView) view.showTab(tab);
    }
  }

  showTransactionsTab(): void {
    this.showBudgetTab("transactions");
  }

  openTransactionSheet(record: TransactionRecord): void {
    new TransactionSheet(this.app, this, record).open();
  }

  showCategoriesTab(): void {
    void this.activateBudgetView().then(() => this.showBudgetTab("categories"));
  }

  openAddTransactionModal(): void {
    new AddTransactionModal(this.app, this).open();
  }

  async persistFilter(): Promise<void> {
    const data = ((await this.loadData()) as PluginData | null) ?? {};
    await this.saveData({ ...data, filter: this.store.serialize() });
  }

  private async handleCaptureLink(params: ProtocolParams): Promise<void> {
    try {
      // No relevance gate here: the link carries fields a person filled in
      // deliberately, not a swept bank thread, so there is nothing to sift.
      const file = await createStructuredTransaction(this.app, params);
      new Notice(`Budget: captured ${file.path}.`, 5000);
    } catch (error) {
      console.error("Ultra Budget Tracker: capture link failed", error);
      new Notice(`Budget capture failed: ${(error as Error).message}`, 10000);
    }
  }

  /**
   * Drains `Budget/Inbox` into transaction notes and reports what happened.
   *
   * Returns the number captured; a caller that gets a non-zero answer owes the
   * new notes a parsing pass. The index is nudged for each one because
   * metadataCache has not necessarily seen a file this same tick.
   */
  private async captureInbox(): Promise<number> {
    const inbox = await ingestInbox(this.app, await this.loadPatterns());
    for (const failure of inbox.failed) {
      console.error("Ultra Budget Tracker: inbox capture failed", failure.path, failure.error);
    }
    const summary = describeInbox(inbox);
    if (summary) new Notice(`Budget: ${summary}.`, 6000);
    for (const path of inbox.created) this.index.refreshPath(path);
    return inbox.created.length;
  }

  /**
   * The vault's patterns, topped up with the built-in ones for the party a
   * message names. The vault's own entries are tried first, so nothing written
   * by hand is overruled.
   */
  private async loadPatterns(): Promise<SmsPatterns> {
    return withDefaultPatterns(await loadVaultJson<SmsPatterns>(this.app, SMS_PATTERNS_PATH, {}));
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
    this.status?.setText(`Budget: ${value}`);
    if (this.processIcon) {
      this.processIcon.toggleClass("is-processing", value === "running…");
      this.processIcon.setAttribute("aria-busy", value === "running…" ? "true" : "false");
    }
  }

  async runFinance(showNotice: boolean): Promise<void> {
    if (this.running) {
      this.queued = true;
      if (showNotice) new Notice("Budget processing is already running; another pass is queued.");
      return;
    }

    this.running = true;
    this.setStatus("running…");
    if (showNotice) new Notice("Budget: processing…");
    try {
      // Whatever the inbox holds becomes a note before the parsing pass, so a
      // capture and its parse land in the same run.
      if (await this.captureInbox()) this.queued = true;
      const updated = await this.processPending();
      this.setStatus("ready");
      if (showNotice) new Notice(`Budget: updated ${updated} transaction(s).`, 6000);
    } catch (error) {
      this.setStatus("error");
      console.error("Ultra Budget Tracker: processing failed", error);
      new Notice(`Budget processing failed: ${(error as Error).message}`, 10000);
    } finally {
      this.running = false;
      if (this.queued) {
        this.queued = false;
        window.setTimeout(() => void this.runFinance(false), 500);
      }
    }
  }

  /** Everything the parser reads, gathered the same way for every caller. */
  private async loadParserInputs(): Promise<{
    config: VaultConfig;
    patterns: SmsPatterns;
    accounts: AccountConfig;
    categories: CategoryRules;
  }> {
    const [config, patterns, accountsJson, categories] = await Promise.all([
      loadVaultJson<VaultConfig>(this.app, CONFIG_PATH, { default_currency: "EGP" }),
      this.loadPatterns(),
      loadVaultJson<AccountConfig>(this.app, ACCOUNTS_CONFIG_PATH, { accounts: [] }),
      loadVaultJson<CategoryRules>(this.app, CATEGORY_RULES_PATH, { rules: [] }),
    ]);
    // The account notes are the source of truth for card endings and aliases;
    // the accounts settings note only covers accounts that have no note yet.
    return {
      config,
      patterns,
      accounts: mergeAccountSources(this.index.accounts(), accountsJson),
      categories,
    };
  }

  /**
   * Reads the merchant, recipient or sender out of the stored message of every
   * transaction that names nobody yet.
   *
   * A note that reached `parsed` is never parsed again, so transactions filed
   * before the parser learned a wording keep their empty party key forever.
   * This is the catch-up pass, and it only ever fills a blank: a name already
   * in the note, typed or parsed, is left exactly as it is.
   */
  async fillMissingCounterparties(): Promise<number> {
    const { config, patterns, accounts, categories } = await this.loadParserInputs();

    let updated = 0;
    for (const record of this.index.transactions()) {
      if (record.counterparty || !record.smsMessage) continue;
      const parsed = parseSms(record.smsMessage, record.timestamp, config, patterns, accounts, categories);
      const { counterparty, counterpartyRole } = readCounterparty(parsed);
      if (!counterparty) continue;
      this.ignoreWatchUntil.set(record.path, Date.now() + 2000);
      await updateTransaction(
        this.app, record.path, counterpartyFields(counterparty, counterpartyRole),
      );
      updated += 1;
    }
    return updated;
  }

  async processPending(): Promise<number> {
    const { config, patterns, accounts, categories } = await this.loadParserInputs();
    const { rules } = await loadRules(this.app);

    let updated = 0;
    for (const record of this.index.transactions()) {
      let changes: Record<string, unknown> = {};

      // A note filed under a stand-in card name is parsed again even though it
      // reached `parsed`: the ending was unknown at the time, and listing it on
      // an account note is what makes the answer available. Nothing is written
      // while the ending stays unknown, because the parse returns the same
      // stand-in the note already holds.
      const provisional =
        isPlaceholderAccount(record.fromAccount) || isPlaceholderAccount(record.toAccount);
      const needsParsing =
        (record.status !== "parsed" || provisional) && Boolean(record.smsMessage);
      if (needsParsing) {
        const parsed = parseSms(record.smsMessage, record.timestamp, config, patterns, accounts, categories);
        changes = parserChanges(record, parsed);
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

  /**
   * Writes a new category note and answers with its path. It borrows the
   * currency of the categories already there, since a vault that budgets in one
   * currency almost never gains a second.
   */
  async createCategory(name: string): Promise<string> {
    const currency = this.index.categories()[0]?.currency ?? "EGP";
    const path = await createCategoryNote(this.app, {
      name, currency, color: null, icon: null, monthlyBudget: null,
    });
    // metadataCache has not necessarily seen a file created this same tick.
    this.index.refreshPath(path);
    return path;
  }

  /**
   * Files every transaction of one category under another, and answers with how
   * many moved. The writes are hidden from the watcher: re-filing a transaction
   * changes nothing the parser would want to look at again.
   */
  async recategorize(from: string, to: string): Promise<number> {
    let moved = 0;
    for (const record of this.index.transactions()) {
      if (record.category !== from) continue;
      this.ignoreWatchUntil.set(record.path, Date.now() + 2000);
      await updateTransaction(this.app, record.path, { category: to });
      moved += 1;
    }
    return moved;
  }

  /**
   * Points every transaction that named one account at another, and answers
   * with how many moved. An account is matched by name everywhere money is
   * counted, so a renamed note whose transactions still carry the old name
   * would leave both of them holding half a balance.
   */
  async renameAccountReferences(from: string, to: string): Promise<number> {
    let moved = 0;
    for (const record of this.index.transactions()) {
      const changes: Record<string, unknown> = {};
      if (sameName(record.fromAccount, from)) changes.from_account = to;
      if (sameName(record.toAccount, from)) changes.to_account = to;
      if (!Object.keys(changes).length) continue;
      this.ignoreWatchUntil.set(record.path, Date.now() + 2000);
      await updateTransaction(this.app, record.path, changes);
      moved += 1;
    }
    return moved;
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
