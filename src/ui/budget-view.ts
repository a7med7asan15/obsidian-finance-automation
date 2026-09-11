import { ItemView, WorkspaceLeaf } from "obsidian";
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
  private bodyEl!: HTMLElement;
  private tabBarEl!: HTMLElement;
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

    this.tabBarEl = root.createDiv({ cls: "fin-tabs" });
    this.bodyEl = root.createDiv({ cls: "fin-tab-body" });

    this.renderTabBar();
    this.renderActiveTab();

    // Re-render when the data changes or the filter changes. Both are cheap
    // enough at this scale that a full redraw of the active tab is the
    // simplest correct answer.
    this.unsubscribe.push(this.plugin.index.subscribe(() => this.renderActiveTab()));
    this.unsubscribe.push(this.plugin.store.subscribe(() => {
      void this.plugin.persistFilter();
      this.renderActiveTab();
    }));
  }

  override async onClose(): Promise<void> {
    for (const stop of this.unsubscribe) stop();
    this.unsubscribe = [];
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
    this.bodyEl.empty();
    if (this.activeTab === "transactions") this.renderTransactions();
    else if (this.activeTab === "accounts") this.renderAccounts();
    else this.renderStats();
  }

  // Filled in by Task 6 (transactions) and Plan C (accounts, stats).
  private renderTransactions(): void {
    this.bodyEl.createEl("p", { text: "Transactions" });
  }

  private renderAccounts(): void {
    this.bodyEl.createEl("p", { text: "Accounts" });
  }

  private renderStats(): void {
    this.bodyEl.createEl("p", { text: "Stats" });
  }
}
