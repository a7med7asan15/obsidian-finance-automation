import { ItemView, setIcon } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import { PeriodPicker } from "./components/period-picker.ts";
import { FilterBar } from "./components/filter-bar.ts";
import { TransactionsTab } from "./tabs/transactions-tab.ts";
import { AccountsTab } from "./tabs/accounts-tab.ts";
import { MerchantsTab } from "./tabs/merchants-tab.ts";
import { CategoriesTab } from "./tabs/categories-tab.ts";
import { StatsTab } from "./tabs/stats-tab.ts";
import type FinanceAutomationPlugin from "../main.ts";

export const BUDGET_VIEW_TYPE = "finance-budget-view";

export type BudgetTab = "transactions" | "merchants" | "categories" | "accounts" | "stats";

// A phone fits five tabs only as icons over short labels, so each tab carries
// both; the stylesheet picks which label shows for the width it has.
const TABS: Array<{ id: BudgetTab; label: string; short: string; icon: string }> = [
  { id: "transactions", label: "Transactions", short: "Txns", icon: "receipt" },
  { id: "merchants", label: "Merchants", short: "Merchants", icon: "store" },
  { id: "categories", label: "Categories", short: "Categories", icon: "tags" },
  { id: "accounts", label: "Accounts", short: "Accounts", icon: "landmark" },
  { id: "stats", label: "Stats", short: "Stats", icon: "bar-chart-2" },
];

export class BudgetView extends ItemView {
  private readonly plugin: FinanceAutomationPlugin;
  private activeTab: BudgetTab = "transactions";
  private headerEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private tabBarEl!: HTMLElement;
  private filterBar: FilterBar | null = null;
  private transactionsTab!: TransactionsTab;
  private merchantsTab!: MerchantsTab;
  private categoriesTab!: CategoriesTab;
  private accountsTab!: AccountsTab;
  private statsTab!: StatsTab;
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
    this.merchantsTab = new MerchantsTab(this.plugin);
    this.categoriesTab = new CategoriesTab(this.plugin);
    this.accountsTab = new AccountsTab(this.plugin);
    this.statsTab = new StatsTab(this.plugin);

    this.tabBarEl = root.createDiv({ cls: "fin-tabs" });
    // Obsidian mobile opens the sidebar on a sideways swipe that starts
    // anywhere in the view; a thumb on the tab bar meant to press a tab.
    this.tabBarEl.addEventListener("touchstart", (event) => event.stopPropagation(), { passive: true });
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
      this.merchantsTab.resetPaging();
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
      const button = this.tabBarEl.createEl("button", { cls: "fin-tab" });
      setIcon(button.createSpan({ cls: "fin-tab-icon" }), tab.icon);
      button.createSpan({ cls: "fin-tab-label", text: tab.label });
      button.createSpan({ cls: "fin-tab-label-short", text: tab.short });
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

  showTab(tab: BudgetTab): void {
    this.activeTab = tab;
    this.renderTabBar();
    this.renderActiveTab();
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
    else if (this.activeTab === "merchants") this.renderMerchants();
    else if (this.activeTab === "categories") this.renderCategories();
    else if (this.activeTab === "accounts") this.renderAccounts();
    else this.renderStats();
  }

  private renderTransactions(): void {
    this.transactionsTab.render(this.bodyEl);
  }

  private renderMerchants(): void {
    this.merchantsTab.render(this.bodyEl);
  }

  private renderCategories(): void {
    this.categoriesTab.render(this.bodyEl);
  }

  private renderAccounts(): void {
    this.accountsTab.render(this.bodyEl);
  }

  private renderStats(): void {
    this.statsTab.render(this.bodyEl);
  }
}
