import { ItemView } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import { PeriodPicker } from "./components/period-picker.ts";
import { FilterBar } from "./components/filter-bar.ts";
import { TransactionsTab } from "./tabs/transactions-tab.ts";
import type FinanceAutomationPlugin from "../main.ts";

export const BUDGET_VIEW_TYPE = "finance-budget-view";

export type BudgetTab = "transactions" | "accounts" | "stats";

const TABS: Array<{ id: BudgetTab; label: string }> = [
  { id: "transactions", label: "Transactions" },
  { id: "accounts", label: "Accounts" },
  { id: "stats", label: "Stats" },
];

export class BudgetView extends ItemView {
  private readonly plugin: FinanceAutomationPlugin;
  private activeTab: BudgetTab = "transactions";
  private headerEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private tabBarEl!: HTMLElement;
  private filterBar: FilterBar | null = null;
  private transactionsTab!: TransactionsTab;
  private unsubscribe: Array<() => void> = [];

  constructor(leaf: WorkspaceLeaf, plugin: FinanceAutomationPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  override getViewType(): string {
    return BUDGET_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return "Budget";
  }

  override getIcon(): string {
    return "wallet";
  }

  override async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("finance-budget");

    this.transactionsTab = new TransactionsTab(this.plugin);

    this.tabBarEl = root.createDiv({ cls: "fin-tabs" });
    this.headerEl = root.createDiv({ cls: "fin-header" });
    this.bodyEl = root.createDiv({ cls: "fin-tab-body" });

    this.renderTabBar();
    this.renderActiveTab();

    // Re-render when the data changes or the filter changes. Both are cheap
    // enough at this scale that a full redraw of the active tab is the
    // simplest correct answer.
    this.unsubscribe.push(this.plugin.index.subscribe(() => this.renderActiveTab()));
    this.unsubscribe.push(this.plugin.store.subscribe(() => {
      void this.plugin.persistFilter();
      // A new filter is a new question; start its answer at the top.
      this.transactionsTab.resetPaging();
      this.renderActiveTab();
    }));
  }

  override async onClose(): Promise<void> {
    for (const stop of this.unsubscribe) stop();
    this.unsubscribe = [];
    this.filterBar = null;
  }

  private renderTabBar(): void {
    this.tabBarEl.empty();
    for (const tab of TABS) {
      const button = this.tabBarEl.createEl("button", { cls: "fin-tab", text: tab.label });
      button.toggleClass("is-active", tab.id === this.activeTab);
      button.setAttribute("aria-selected", String(tab.id === this.activeTab));
      button.addEventListener("click", () => {
        if (this.activeTab === tab.id) return;
        this.activeTab = tab.id;
        this.renderTabBar();
        this.renderActiveTab();
      });
    }
  }

  renderActiveTab(): void {
    this.headerEl.empty();
    new PeriodPicker(this.plugin.store).render(this.headerEl);

    // The unfiltered set, so the menus always offer every value in the vault.
    const all = this.plugin.index.transactions();
    if (!this.filterBar) this.filterBar = new FilterBar(this.plugin.store, all);
    else this.filterBar.setRecords(all);
    this.filterBar.render(this.headerEl);

    this.bodyEl.empty();
    if (this.activeTab === "transactions") this.renderTransactions();
    else if (this.activeTab === "accounts") this.renderAccounts();
    else this.renderStats();
  }

  // Filled in by Task 6 (transactions) and Plan C (accounts, stats).
  private renderTransactions(): void {
    this.transactionsTab.render(this.bodyEl);
  }

  private renderAccounts(): void {
    this.bodyEl.createEl("p", { text: "Accounts" });
  }

  private renderStats(): void {
    this.bodyEl.createEl("p", { text: "Stats" });
  }
}
