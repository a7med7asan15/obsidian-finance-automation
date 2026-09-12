import { Notice, setIcon } from "obsidian";
import { applyFilter } from "../../domain/filter.ts";
import { counterpartySummary } from "../../domain/aggregate.ts";
import { cairoToday, periodLabel } from "../../domain/dates.ts";
import { ROLE_LABELS } from "../../domain/counterparty.ts";
import { withKeyword } from "../../domain/categorize.ts";
import { loadCategoryRules, saveCategoryRules } from "../../data/category-rules.ts";
import { setCategory } from "../../data/write.ts";
import { categoryColor } from "../colors.ts";
import { formatAmount } from "../format.ts";
import { renderEmptyState } from "../components/empty-state.ts";
import { CategoryNameModal } from "../components/category-editor.ts";
import type FinanceAutomationPlugin from "../../main.ts";
import type { CounterpartyTotal } from "../../domain/aggregate.ts";
import type { CategoryRecord } from "../../data/types.ts";

type SortKey = "total" | "count" | "name" | "recent";

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: "total", label: "Amount" },
  { id: "count", label: "Times" },
  { id: "recent", label: "Recent" },
  { id: "name", label: "Name" },
];

const PAGE_SIZE = 60;

/**
 * The dropdown entry that makes a category instead of choosing one. A slash
 * cannot appear in a category name, so no real one can ever collide with it.
 */
const NEW_CATEGORY = "/new";

function compare(sort: SortKey): (a: CounterpartyTotal, b: CounterpartyTotal) => number {
  if (sort === "count") return (a, b) => b.count - a.count || a.name.localeCompare(b.name);
  if (sort === "name") return (a, b) => a.name.localeCompare(b.name);
  if (sort === "recent") {
    return (a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? "") || a.name.localeCompare(b.name);
  }
  return (a, b) => b.spent + b.received - (a.spent + a.received) || a.name.localeCompare(b.name);
}

/**
 * Every merchant, recipient and sender in one list, so categories can be
 * settled a name at a time instead of a transaction at a time.
 *
 * Choosing a category does two things: it files every transaction that party
 * already has, and it writes the name into the keyword rules so the next
 * message mentioning it files itself. That second half is the point — the list
 * is meant to get shorter each time you visit it.
 */
export class MerchantsTab {
  private sort: SortKey = "total";
  private uncategorizedOnly = false;
  private shown = PAGE_SIZE;

  constructor(private readonly plugin: FinanceAutomationPlugin) {}

  resetPaging(): void {
    this.shown = PAGE_SIZE;
  }

  render(container: HTMLElement): void {
    const filter = this.plugin.store.get();
    const records = applyFilter(this.plugin.index.transactions(), filter, cairoToday());
    const all = counterpartySummary(records);
    const unnamed = records.filter(
      (record) => !record.counterparty && record.smsMessage,
    ).length;

    if (!all.length) {
      renderEmptyState(
        container, "store", "No names yet",
        records.length
          ? "None of these transactions name anyone yet. Try reading the stored messages again, widen the period, or add your bank's wording to merchant_patterns in Budget/Settings/sms_patterns.json."
          : "No transactions match these filters. Try a different period.",
      );
      if (unnamed) this.renderFillButton(container, unnamed);
      return;
    }

    const rows = all
      .filter((item) => !this.uncategorizedOnly || item.categories.includes("Uncategorized"))
      .sort(compare(this.sort));

    this.renderToolbar(container, all, unnamed);

    if (!rows.length) {
      renderEmptyState(
        container, "check", "Everything is categorised",
        `All ${all.length} names in ${periodLabel(filter.period)} have a category.`,
      );
      return;
    }

    const categories = new Map(this.plugin.index.categories().map((entry) => [entry.name, entry]));
    const list = container.createDiv({ cls: "fin-merchant-list" });
    for (const item of rows.slice(0, this.shown)) this.renderRow(list, item, categories);

    if (rows.length > this.shown) {
      const more = list.createEl("button", {
        cls: "fin-more",
        text: `Show ${Math.min(PAGE_SIZE, rows.length - this.shown)} more of ${rows.length}`,
      });
      more.addEventListener("click", () => {
        this.shown += PAGE_SIZE;
        this.plugin.refreshBudgetView();
      });
    }
  }

  private renderToolbar(
    container: HTMLElement,
    all: CounterpartyTotal[],
    unnamed: number,
  ): void {
    const bar = container.createDiv({ cls: "fin-merchant-bar" });

    const pending = all.filter((item) => item.categories.includes("Uncategorized")).length;
    bar.createSpan({
      cls: "fin-merchant-count",
      text: `${all.length} name${all.length === 1 ? "" : "s"}` +
        (pending ? ` · ${pending} to categorise` : ""),
    });

    const sorts = bar.createDiv({ cls: "fin-merchant-sorts" });
    for (const option of SORTS) {
      const button = sorts.createEl("button", { cls: "fin-chip", text: option.label });
      button.toggleClass("is-active", this.sort === option.id);
      button.addEventListener("click", () => {
        this.sort = option.id;
        this.resetPaging();
        this.plugin.refreshBudgetView();
      });
    }

    const toggle = bar.createEl("button", { cls: "fin-chip", text: "Needs a category" });
    toggle.toggleClass("is-active", this.uncategorizedOnly);
    toggle.addEventListener("click", () => {
      this.uncategorizedOnly = !this.uncategorizedOnly;
      this.resetPaging();
      this.plugin.refreshBudgetView();
    });

    if (unnamed > 0) this.renderFillButton(bar, unnamed);
  }

  /**
   * A transaction parsed before the patterns knew its wording keeps an empty
   * party key, because a note that reached `parsed` is never parsed again. This
   * is the way back for those, offered where their absence shows.
   */
  private renderFillButton(container: HTMLElement, unnamed: number): void {
    const wrapper = container.createDiv({ cls: "fin-merchant-unnamed" });
    wrapper.createSpan({
      text: `${unnamed} transaction${unnamed === 1 ? "" : "s"} with a message name nobody. `,
    });
    const button = wrapper.createEl("button", {
      cls: "fin-chip",
      text: "Read their messages again",
    });
    button.addEventListener("click", () => {
      button.disabled = true;
      void this.plugin.fillMissingCounterparties()
        .then((filled) => {
          new Notice(`Named the other side of ${filled} transaction(s).`, 6000);
        })
        .catch((error: Error) => {
          new Notice(`Could not read the messages: ${error.message}`, 10000);
        })
        .finally(() => { button.disabled = false; });
    });
  }

  private renderRow(
    list: HTMLElement,
    item: CounterpartyTotal,
    categories: Map<string, CategoryRecord>,
  ): void {
    const row = list.createDiv({ cls: "fin-merchant-row" });
    row.toggleClass("is-pending", item.categories.includes("Uncategorized"));

    const head = row.createDiv({ cls: "fin-merchant-head" });
    const name = head.createDiv({ cls: "fin-merchant-name", text: item.name });
    name.setAttribute("role", "button");
    name.setAttribute("aria-label", `Show the transactions of ${item.name}`);
    name.addEventListener("click", () => {
      this.plugin.store.set({ search: item.name });
      this.plugin.showTransactionsTab();
    });

    const amounts = head.createDiv({ cls: "fin-merchant-amounts" });
    if (item.spent) {
      amounts.createSpan({ cls: "fin-out fin-amount", text: `−${formatAmount(item.spent)}` });
    }
    if (item.received) {
      amounts.createSpan({ cls: "fin-in fin-amount", text: `+${formatAmount(item.received)}` });
    }
    if (item.currency) amounts.createSpan({ cls: "fin-merchant-currency", text: item.currency });

    const meta = row.createDiv({ cls: "fin-merchant-meta" });
    meta.createSpan({
      text: [
        item.roles.map((role) => ROLE_LABELS[role]).join(" · ") || ROLE_LABELS[""],
        `${item.count} transaction${item.count === 1 ? "" : "s"}`,
        item.lastDate ? `last ${item.lastDate}` : "",
      ].filter(Boolean).join(" · "),
    });

    if (item.categories.length > 1) {
      const chips = row.createDiv({ cls: "fin-merchant-chips" });
      for (const category of item.categories) {
        const chip = chips.createSpan({ cls: "fin-merchant-chip", text: category });
        chip.style.setProperty("--fin-cat-color", categoryColor(category, categories));
      }
    }

    const options = [...categories.keys()].sort((a, b) => a.localeCompare(b));
    const select = row.createEl("select", { cls: "fin-merchant-select dropdown" });
    select.setAttribute("aria-label", `Category for ${item.name}`);
    const placeholder = item.categories.length > 1 ? "Mixed — choose one" : "Choose a category";
    select.createEl("option", { value: "", text: placeholder });
    for (const category of options.length ? options : ["Uncategorized"]) {
      select.createEl("option", { value: category, text: category });
    }
    // A party whose transactions already agree shows that category; a mixed one
    // shows the placeholder, because no single answer is true yet.
    select.value = item.category && item.category !== "Uncategorized" ? item.category : "";
    select.createEl("option", { value: NEW_CATEGORY, text: "New category\u2026" });
    select.addEventListener("change", () => {
      const chosen = select.value;
      if (!chosen) return;
      if (chosen === NEW_CATEGORY) {
        // Back to the placeholder while the prompt is open: nothing is chosen
        // until the category exists.
        select.value = "";
        this.promptForCategory(item, [...categories.keys()]);
        return;
      }
      select.disabled = true;
      void this.assign(item, chosen).finally(() => { select.disabled = false; });
    });

    const open = row.createEl("button", {
      cls: "fin-merchant-open",
      attr: { "aria-label": `Show the transactions of ${item.name}` },
    });
    setIcon(open, "chevron-right");
    open.addEventListener("click", () => {
      this.plugin.store.set({ search: item.name });
      this.plugin.showTransactionsTab();
    });
  }

  /**
   * Naming a category you do not have yet is the common case here: the list is
   * where you find out you need one. Creating it files the party in the same
   * step, so the answer you had in mind lands without a detour through the
   * category editor.
   */
  private promptForCategory(item: CounterpartyTotal, taken: string[]): void {
    new CategoryNameModal(this.plugin.app, {
      title: `New category for ${item.name}`,
      submit: "Create and file",
      value: "",
      taken,
      onSubmit: async (name) => {
        try {
          await this.plugin.createCategory(name);
        } catch (error) {
          new Notice(`Could not create the category: ${(error as Error).message}`, 10000);
          return;
        }
        await this.assign(item, name);
      },
    }).open();
  }

  /**
   * Files every transaction of one party and teaches the parser the name, in
   * that order: the notes are the record, and the rule only affects what has
   * not arrived yet. A failure part-way through still reports what it managed.
   */
  private async assign(item: CounterpartyTotal, category: string): Promise<void> {
    let filed = 0;
    try {
      for (const path of item.paths) {
        await setCategory(this.plugin.app, path, category);
        filed += 1;
      }
      const rules = await loadCategoryRules(this.plugin.app);
      await saveCategoryRules(this.plugin.app, withKeyword(rules, category, item.name));
      new Notice(
        `Filed ${filed} transaction${filed === 1 ? "" : "s"} of ${item.name} under ${category}, ` +
        "and future messages that mention it too.",
        6000,
      );
    } catch (error) {
      new Notice(
        `Filed ${filed} of ${item.paths.length} transactions before failing: ${(error as Error).message}`,
        10000,
      );
    }
  }
}
