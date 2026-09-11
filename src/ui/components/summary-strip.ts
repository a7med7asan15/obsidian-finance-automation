import { formatAmount } from "../format.ts";
import type { Totals } from "../../domain/aggregate.ts";

export class SummaryStrip {
  render(container: HTMLElement, totals: Map<string, Totals>): void {
    const wrapper = container.createDiv({ cls: "fin-summary" });

    if (!totals.size) {
      // Render zeroes rather than nothing, so the layout does not jump when
      // the first transaction of a month arrives.
      this.renderRow(wrapper, "", { income: 0, expenses: 0, transfers: 0, net: 0, count: 0 });
      return;
    }

    const currencies = [...totals.keys()].sort();
    for (const currency of currencies) {
      this.renderRow(wrapper, currencies.length > 1 ? currency : "", totals.get(currency)!);
    }
  }

  private renderRow(container: HTMLElement, currencyLabel: string, totals: Totals): void {
    if (currencyLabel) container.createDiv({ cls: "fin-summary-currency", text: currencyLabel });
    const row = container.createDiv({ cls: "fin-summary-row" });
    this.cell(row, "Income", formatAmount(totals.income), "fin-in");
    this.cell(row, "Expenses", formatAmount(totals.expenses), "fin-out");
    this.cell(row, "Net", formatAmount(totals.net), totals.net < 0 ? "fin-out" : "fin-in");
  }

  private cell(row: HTMLElement, label: string, value: string, tone: string): void {
    const cell = row.createDiv({ cls: "fin-summary-cell" });
    cell.createDiv({ cls: "fin-summary-label", text: label });
    cell.createDiv({ cls: `fin-summary-value fin-amount ${tone}`, text: value });
  }
}
