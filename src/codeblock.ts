import { parseYaml } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";
import { applyFilter } from "./domain/filter.ts";
import { primaryCurrency, spendByCategory, totalsByCurrency } from "./domain/aggregate.ts";
import { cairoToday } from "./domain/dates.ts";
import { DEFAULT_FILTER } from "./data/types.ts";
import { categoryColor } from "./ui/colors.ts";
import { formatAmount } from "./ui/format.ts";
import { renderHBars } from "./ui/charts/hbars.ts";
import type FinanceAutomationPlugin from "./main.ts";
import type { Filter, Period } from "./data/types.ts";

interface BlockOptions {
  period?: string;
  categories?: string;
  accounts?: string;
  limit?: number;
}

function parsePeriod(value: string | undefined, today: string): Period {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "all") return { unit: "all", anchor: "", from: null, to: null };
  if (/^\d{4}$/.test(text)) return { unit: "year", anchor: text, from: null, to: null };
  if (/^\d{4}-\d{2}$/.test(text)) return { unit: "month", anchor: text, from: null, to: null };
  return { unit: "month", anchor: today.slice(0, 7), from: null, to: null };
}

function splitList(value: string | undefined): string[] {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

export function registerFinanceCodeBlock(plugin: FinanceAutomationPlugin): void {
  plugin.registerMarkdownCodeBlockProcessor(
    "finance-summary",
    (source: string, element: HTMLElement, _context: MarkdownPostProcessorContext) => {
      element.empty();
      element.addClass("finance-budget", "fin-embed");

      let options: BlockOptions = {};
      if (source.trim()) {
        try {
          options = (parseYaml(source) ?? {}) as BlockOptions;
        } catch (error) {
          element.createEl("p", { cls: "fin-embed-error", text: `finance-summary: ${(error as Error).message}` });
          return;
        }
      }

      const today = cairoToday();
      const filter: Filter = {
        ...DEFAULT_FILTER,
        period: parsePeriod(options.period, today),
        categories: splitList(options.categories),
        accounts: splitList(options.accounts),
      };

      const records = applyFilter(plugin.index.transactions(), filter, today);
      if (!records.length) {
        element.createEl("p", { cls: "fin-panel-empty", text: "No transactions for this period." });
        return;
      }

      const currency = primaryCurrency(records);
      const totals = totalsByCurrency(records).get(currency);

      if (totals) {
        const strip = element.createDiv({ cls: "fin-summary-row" });
        for (const [label, value, tone] of [
          ["Income", totals.income, "fin-in"],
          ["Expenses", totals.expenses, "fin-out"],
          ["Net", totals.net, totals.net < 0 ? "fin-out" : "fin-in"],
        ] as const) {
          const cell = strip.createDiv({ cls: "fin-summary-cell" });
          cell.createDiv({ cls: "fin-summary-label", text: label });
          cell.createDiv({ cls: `fin-summary-value fin-amount ${tone}`, text: formatAmount(value) });
        }
      }

      const categories = new Map(plugin.index.categories().map((item) => [item.name, item]));
      renderHBars(
        element,
        spendByCategory(records, currency)
          .slice(0, options.limit ?? 5)
          .map((item) => ({
            label: item.category,
            value: item.amount,
            color: categoryColor(item.category, categories),
          })),
        { currency },
      );

      const open = element.createEl("button", { cls: "fin-more", text: "Open Budget" });
      open.addEventListener("click", () => void plugin.activateBudgetView());
    },
  );
}
