import { Menu, Notice, setIcon } from "obsidian";
import { applyFilter } from "../../domain/filter.ts";
import { groupByDay, totalsByCurrency } from "../../domain/aggregate.ts";
import { cairoToday } from "../../domain/dates.ts";
import { formatAmount, formatDayHeader } from "../format.ts";
import { SummaryStrip } from "../components/summary-strip.ts";
import { TransactionRow } from "../components/transaction-row.ts";
import { renderEmptyState } from "../components/empty-state.ts";
import { setCategory, setExcluded } from "../../data/write.ts";
import type FinanceAutomationPlugin from "../../main.ts";
import type { TransactionRecord } from "../../data/types.ts";

const PAGE_SIZE = 100;

export class TransactionsTab {
  private shown = PAGE_SIZE;

  constructor(private readonly plugin: FinanceAutomationPlugin) {}

  /** Reset paging whenever the filter changes, so a new filter starts at the top. */
  resetPaging(): void {
    this.shown = PAGE_SIZE;
  }

  render(container: HTMLElement): void {
    const today = cairoToday();
    const all = this.plugin.index.transactions();
    const filtered = applyFilter(all, this.plugin.store.get(), today);
    const categories = new Map(this.plugin.index.categories().map((item) => [item.name, item]));

    new SummaryStrip().render(container, totalsByCurrency(filtered));

    if (!filtered.length) {
      renderEmptyState(
        container, "receipt",
        all.length ? "Nothing matches these filters" : "No transactions yet",
        all.length
          ? "Try a different month, or clear the filters."
          : "Capture one from the iPhone Shortcut, or add one by hand.",
      );
      this.renderAddButton(container);
      return;
    }

    const list = container.createDiv({ cls: "fin-list" });
    const visible = filtered.slice(0, this.shown);

    for (const group of groupByDay(visible)) {
      const header = list.createDiv({ cls: "fin-day-header" });
      header.createSpan({ cls: "fin-day-label", text: formatDayHeader(group.date, today) });

      const totals = [...group.totals].map(([currency, dayTotals]) =>
        `${formatAmount(dayTotals.expenses)}${group.totals.size > 1 ? ` ${currency}` : ""}`,
      ).join(" · ");
      header.createSpan({ cls: "fin-day-total fin-amount", text: totals });

      for (const record of group.records) {
        new TransactionRow(record, categories, {
          onOpen: (target) => this.plugin.openTransactionSheet(target),
          onQuickMenu: (target, event) => this.openQuickMenu(target, event),
        }).render(list);
      }
    }

    if (filtered.length > this.shown) {
      const more = list.createEl("button", {
        cls: "fin-more",
        text: `Show ${Math.min(PAGE_SIZE, filtered.length - this.shown)} more of ${filtered.length}`,
      });
      more.addEventListener("click", () => {
        this.shown += PAGE_SIZE;
        this.plugin.refreshBudgetView();
      });
    }

    this.renderAddButton(container);
  }

  private renderAddButton(container: HTMLElement): void {
    const button = container.createEl("button", { cls: "fin-fab", attr: { "aria-label": "Add transaction" } });
    setIcon(button, "plus");
    button.addEventListener("click", () => this.plugin.openAddTransactionModal());
  }

  private openQuickMenu(record: TransactionRecord, event: MouseEvent): void {
    const menu = new Menu();

    menu.addItem((item) =>
      item.setTitle(record.excluded ? "Include in calculations" : "Exclude from calculations")
        .setIcon(record.excluded ? "eye" : "eye-off")
        .onClick(async () => {
          try {
            await setExcluded(
              this.plugin.app, record.path, !record.excluded,
              record.excluded ? "" : "Excluded by hand", "manual",
            );
          } catch (error) {
            new Notice(`Could not update the transaction: ${(error as Error).message}`);
          }
        }),
    );

    menu.addSeparator();

    const names = this.plugin.index.categories().map((item) => item.name).sort();
    for (const name of names.length ? names : ["Uncategorized"]) {
      menu.addItem((item) =>
        item.setTitle(name).setChecked(record.category === name).onClick(async () => {
          try {
            await setCategory(this.plugin.app, record.path, name);
          } catch (error) {
            new Notice(`Could not set the category: ${(error as Error).message}`);
          }
        }),
      );
    }

    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle("Open note").setIcon("file-text").onClick(() => {
        void this.plugin.app.workspace.openLinkText(record.path, "", true);
      }),
    );

    menu.showAtMouseEvent(event);
  }
}
