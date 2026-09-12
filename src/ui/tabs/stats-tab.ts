import { Notice } from "obsidian";
import { applyFilter } from "../../domain/filter.ts";
import {
  primaryCurrency, spendByCategory, spendByDay, spendByMerchant, spendByMonth, totalsByCurrency,
} from "../../domain/aggregate.ts";
import { budgetProgress } from "../../domain/budgets.ts";
import { deriveBalances, netWorthByCurrency } from "../../domain/balances.ts";
import { cairoToday, periodLabel, resolvePeriod } from "../../domain/dates.ts";
import { categoryColor } from "../colors.ts";
import { formatAmount } from "../format.ts";
import { renderPanel } from "../components/panel.ts";
import { renderDonut } from "../charts/donut.ts";
import { renderBars } from "../charts/bars.ts";
import { renderHBars } from "../charts/hbars.ts";
import { renderEmptyState } from "../components/empty-state.ts";
import { exportCsv } from "../export-csv.ts";
import type FinanceAutomationPlugin from "../../main.ts";
import type { TransactionRecord } from "../../data/types.ts";

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export class StatsTab {
  constructor(private readonly plugin: FinanceAutomationPlugin) {}

  render(container: HTMLElement): void {
    const today = cairoToday();
    const filter = this.plugin.store.get();
    const records = applyFilter(this.plugin.index.transactions(), filter, today);

    if (!records.length) {
      renderEmptyState(
        container, "bar-chart-3", "Nothing to chart",
        "No transactions match these filters. Try a different period.",
      );
      return;
    }

    const grid = container.createDiv({ cls: "fin-panel-grid" });
    const currency = primaryCurrency(records);
    const label = periodLabel(filter.period);

    this.renderFlowPanel(grid, records, label);
    this.renderCategoryPanel(grid, records, currency, label);
    this.renderTrendPanel(grid, records, currency, today);
    this.renderBudgetPanel(grid, records, label);
    this.renderMerchantPanel(grid, records, currency);
    this.renderBalancePanel(grid);

    const actions = container.createDiv({ cls: "fin-stats-actions" });
    const exportButton = actions.createEl("button", { cls: "fin-more", text: "Export these transactions as CSV" });
    exportButton.addEventListener("click", async () => {
      try {
        const path = await exportCsv(this.plugin.app, records, periodLabel(filter.period));
        new Notice(`Exported ${records.length} transactions to ${path}.`);
      } catch (error) {
        new Notice(`Export failed: ${(error as Error).message}`);
      }
    });
  }

  /** 1. Income vs expenses vs net. */
  private renderFlowPanel(grid: HTMLElement, records: TransactionRecord[], label: string): void {
    const body = renderPanel(grid, "Money in and out", label);
    const totals = totalsByCurrency(records);

    for (const [currency, item] of [...totals].sort()) {
      if (totals.size > 1) body.createDiv({ cls: "fin-panel-currency", text: currency });
      renderHBars(body, [
        { label: "Income", value: item.income, color: "var(--fin-money-in)" },
        { label: "Expenses", value: item.expenses, color: "var(--fin-money-out)" },
        ...(item.transfers ? [{ label: "Transfers", value: item.transfers, color: "var(--text-muted)" }] : []),
      ], { currency });

      const net = body.createDiv({ cls: "fin-panel-net" });
      net.createSpan({ text: "Net" });
      net.createSpan({
        cls: `fin-amount ${item.net < 0 ? "fin-out" : "fin-in"}`,
        text: `${item.net < 0 ? "−" : "+"}${formatAmount(item.net)} ${currency}`,
      });
    }
  }

  /** 2. Spending by category, clickable through to the list. */
  private renderCategoryPanel(
    grid: HTMLElement, records: TransactionRecord[], currency: string, label: string,
  ): void {
    const body = renderPanel(grid, "Where it went", `${label} · ${currency}`);
    const categories = new Map(this.plugin.index.categories().map((item) => [item.name, item]));
    const spend = spendByCategory(records, currency);
    const total = spend.reduce((sum, item) => sum + item.amount, 0);

    renderDonut(
      body,
      spend.map((item) => ({
        label: item.category,
        value: item.amount,
        color: categoryColor(item.category, categories),
      })),
      {
        total,
        currency,
        onSelect: (category) => {
          this.plugin.store.set({ categories: [category] });
          this.plugin.showTransactionsTab();
        },
      },
    );
  }

  /** 3. Spending over time — by day within a month, by month otherwise. */
  private renderTrendPanel(
    grid: HTMLElement, records: TransactionRecord[], currency: string, today: string,
  ): void {
    const filter = this.plugin.store.get();
    const range = resolvePeriod(filter.period, today);
    const body = renderPanel(grid, "Spending over time", currency);

    if (filter.period.unit === "month" && range) {
      const days = spendByDay(records, currency, range.from, range.to);
      renderBars(
        body,
        days.map((day) => ({
          label: String(Number(day.date.slice(8))),
          sublabel: day.date,
          value: day.amount,
        })),
        { currency },
      );
      const spent = days.reduce((sum, day) => sum + day.amount, 0);
      const elapsed = days.filter((day) => day.date <= today).length || days.length;
      body.createEl("p", {
        cls: "fin-chart-caption",
        text: `Average ${formatAmount(spent / elapsed)} ${currency} per day so far`,
      });
      return;
    }

    // Year, all time, or a custom range: bucket by month.
    const months = records.map((record) => record.month).filter(Boolean) as string[];
    if (!months.length) {
      body.createEl("p", { cls: "fin-panel-empty", text: "Nothing to show for this period." });
      return;
    }
    const from = months.reduce((min, month) => (month < min ? month : min), months[0]);
    const to = months.reduce((max, month) => (month > max ? month : max), months[0]);

    renderBars(
      body,
      spendByMonth(records, currency, from, to).map((item) => ({
        label: SHORT_MONTHS[Number(item.month.slice(5, 7)) - 1],
        sublabel: item.month,
        value: item.amount,
      })),
      { currency },
    );
  }

  /** 4. Budget progress. */
  private renderBudgetPanel(grid: HTMLElement, records: TransactionRecord[], label: string): void {
    const body = renderPanel(grid, "Budgets", label);
    const categories = this.plugin.index.categories();
    const progress = budgetProgress(categories, records);

    if (!progress.length) {
      body.createEl("p", {
        cls: "fin-panel-empty",
        text: "No budgets set yet. Give a category a monthly budget and it appears here.",
      });
      this.renderCategoryEditorButton(body);
      return;
    }

    renderHBars(
      body,
      progress.map((item) => ({
        label: item.category,
        value: item.spent,
        ratio: item.ratio,
        color: item.level === "over" ? "var(--fin-over)" : item.level === "warn" ? "var(--fin-warn)" : undefined,
        caption: item.remaining >= 0
          ? `${formatAmount(item.remaining)} left of ${formatAmount(item.budget)}`
          : `${formatAmount(-item.remaining)} over ${formatAmount(item.budget)}`,
      })),
      {
        currency: progress[0].currency,
        onSelect: (category) => {
          this.plugin.store.set({ categories: [category] });
          this.plugin.showTransactionsTab();
        },
      },
    );

    this.renderCategoryEditorButton(body);
  }

  private renderCategoryEditorButton(body: HTMLElement): void {
    const button = body.createEl("button", { cls: "fin-more", text: "Edit categories and budgets" });
    button.addEventListener("click", () => this.plugin.openCategoryEditor());
  }

  /** 5. Top merchants. */
  private renderMerchantPanel(
    grid: HTMLElement, records: TransactionRecord[], currency: string,
  ): void {
    const body = renderPanel(grid, "Top merchants", currency);
    const merchants = spendByMerchant(records, currency, 10);
    renderHBars(
      body,
      merchants.map((item) => ({
        label: item.merchant,
        value: item.amount,
        caption: `${item.count} transaction${item.count === 1 ? "" : "s"}`,
      })),
      {
        currency,
        onSelect: (merchant) => {
          this.plugin.store.set({ search: merchant });
          this.plugin.showTransactionsTab();
        },
      },
    );
  }

  /** 6. Account balances. Always all-time — a filtered balance is meaningless. */
  private renderBalancePanel(grid: HTMLElement): void {
    const body = renderPanel(grid, "Balances", "All transactions");
    const balances = deriveBalances(this.plugin.index.accounts(), this.plugin.index.transactions());

    if (!balances.length) {
      body.createEl("p", { cls: "fin-panel-empty", text: "No accounts set up yet." });
      return;
    }

    renderHBars(
      body,
      balances
        .filter((item) => item.balance !== 0)
        .sort((a, b) => b.balance - a.balance)
        .map((item) => ({ label: item.account.name, value: item.balance, caption: item.account.currency })),
      { currency: "" },
    );

    for (const [currency, value] of [...netWorthByCurrency(balances)].sort()) {
      const net = body.createDiv({ cls: "fin-panel-net" });
      net.createSpan({ text: `Net worth (${currency})` });
      net.createSpan({ cls: "fin-amount", text: formatAmount(value) });
    }
  }
}
