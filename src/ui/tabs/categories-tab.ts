import { Notice, Setting, setIcon } from "obsidian";
import { applyFilter } from "../../domain/filter.ts";
import { categorySummary } from "../../domain/aggregate.ts";
import { cairoToday, periodLabel } from "../../domain/dates.ts";
import { renamedCategory, withKeywords, withoutCategory } from "../../domain/categorize.ts";
import { deleteCategoryNote, renameCategoryNote } from "../../data/categories.ts";
import { loadCategoryRules, saveCategoryRules } from "../../data/category-rules.ts";
import { updateCategoryNote } from "../../data/write.ts";
import { CATEGORY_PALETTE, categoryColor, categoryIcon } from "../colors.ts";
import { formatAmount } from "../format.ts";
import { renderEmptyState } from "../components/empty-state.ts";
import { CategoryNameModal, DeleteCategoryModal } from "../components/category-editor.ts";
import type FinanceAutomationPlugin from "../../main.ts";
import type { CategoryTotal } from "../../domain/aggregate.ts";
import type { CategoryRules } from "../../domain/categorize.ts";
import type { CategoryRecord } from "../../data/types.ts";

type SortKey = "total" | "count" | "name" | "recent";

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: "total", label: "Amount" },
  { id: "count", label: "Times" },
  { id: "recent", label: "Recent" },
  { id: "name", label: "Name" },
];

/** A small, recognisable set from Obsidian's bundled Lucide icons. */
const ICON_CHOICES = [
  "shopping-cart", "utensils", "car", "receipt", "shopping-bag", "heart-pulse",
  "trending-up", "percent", "arrow-left-right", "home", "plane", "gift",
  "smartphone", "graduation-cap", "dumbbell", "circle-dashed",
];

/** Where the transactions of a deleted category go when nothing else is chosen. */
const FALLBACK_CATEGORY = "Uncategorized";

/** One row: what the period spent, and the note that names it, if there is one. */
interface Row {
  name: string;
  totals: CategoryTotal | null;
  note: CategoryRecord | null;
}

function compare(sort: SortKey): (a: Row, b: Row) => number {
  const spend = (row: Row) => (row.totals ? row.totals.spent + row.totals.received : 0);
  if (sort === "count") {
    return (a, b) => (b.totals?.count ?? 0) - (a.totals?.count ?? 0) || a.name.localeCompare(b.name);
  }
  if (sort === "name") return (a, b) => a.name.localeCompare(b.name);
  if (sort === "recent") {
    return (a, b) =>
      (b.totals?.lastDate ?? "").localeCompare(a.totals?.lastDate ?? "") ||
      a.name.localeCompare(b.name);
  }
  return (a, b) => spend(b) - spend(a) || a.name.localeCompare(b.name);
}

/**
 * Every category in one list, read the same way as the Merchants tab: a row per
 * name, biggest first, with what the period spent against it — and the editing
 * the category note used to need a separate window for.
 *
 * The list is the sum of two sources, because each answers a different half of
 * the question. The transactions say what a category *cost*; the notes under
 * `Budget/Settings/Categories/` say which categories *exist*, so one you have
 * not spent against yet is still here to be given a colour or a budget.
 */
export class CategoriesTab {
  private sort: SortKey = "total";
  private overBudgetOnly = false;
  /** The names whose editor is open, kept across the redraws a save triggers. */
  private readonly expanded = new Set<string>();
  private rules: CategoryRules = { rules: [] };
  private rulesError: string | null = null;
  private rulesLoaded = false;

  constructor(private readonly plugin: FinanceAutomationPlugin) {}

  render(container: HTMLElement): void {
    // The keyword rules are a file, not part of the index, so the first draw
    // happens without them and redraws itself once they arrive.
    if (!this.rulesLoaded) void this.loadRules();

    const filter = this.plugin.store.get();
    const records = applyFilter(this.plugin.index.transactions(), filter, cairoToday());
    const rows = this.rows(records);

    if (!rows.length) {
      renderEmptyState(
        container, "tag", "No categories yet",
        "A category is a note under Budget/Settings/Categories/. Add the first one below " +
        "and every transaction filed under it will find it.",
      );
      this.renderNewButton(container.createDiv({ cls: "fin-category-bar" }));
      return;
    }

    const shown = rows
      .filter((row) => !this.overBudgetOnly || this.overBudget(row))
      .sort(compare(this.sort));

    this.renderToolbar(container, rows);

    if (this.rulesError) {
      const problem = container.createDiv({ cls: "fin-rule-error" });
      problem.createEl("strong", { text: "The keyword rules could not be read:" });
      problem.createEl("pre", { text: this.rulesError });
      problem.createEl("p", {
        text: "Fix Budget/Settings/Categories/rules.json, then reopen the Budget view. " +
          "Colours and budgets can still be changed; keywords cannot, because saving " +
          "them would discard the rules that failed to load.",
      });
    }

    if (!shown.length) {
      renderEmptyState(
        container, "check", "Nothing is over budget",
        `Every budgeted category is within its budget in ${periodLabel(filter.period)}.`,
      );
      return;
    }

    // One lookup for the whole list: a colour and an icon are read per row.
    const notes = new Map(this.plugin.index.categories().map((entry) => [entry.name, entry]));
    const list = container.createDiv({ cls: "fin-category-list" });
    for (const row of shown) this.renderRow(list, row, notes);
  }

  /** The categories the period spent against, plus every category note there is. */
  private rows(records: Parameters<typeof categorySummary>[0]): Row[] {
    const byName = new Map<string, Row>();
    for (const totals of categorySummary(records)) {
      byName.set(totals.name, { name: totals.name, totals, note: null });
    }
    for (const note of this.plugin.index.categories()) {
      const existing = byName.get(note.name);
      if (existing) existing.note = note;
      else byName.set(note.name, { name: note.name, totals: null, note });
    }
    return [...byName.values()];
  }

  private async loadRules(): Promise<void> {
    this.rulesLoaded = true;
    try {
      this.rules = await loadCategoryRules(this.plugin.app);
    } catch (error) {
      this.rulesError = (error as Error).message;
    }
    this.plugin.refreshBudgetView();
  }

  private budget(row: Row): number | null {
    return row.note?.monthlyBudget ?? null;
  }

  private overBudget(row: Row): boolean {
    const budget = this.budget(row);
    return budget !== null && budget > 0 && (row.totals?.spent ?? 0) > budget;
  }

  private renderToolbar(container: HTMLElement, rows: Row[]): void {
    const bar = container.createDiv({ cls: "fin-category-bar" });

    const over = rows.filter((row) => this.overBudget(row)).length;
    const unnoted = rows.filter((row) => !row.note).length;
    bar.createSpan({
      cls: "fin-category-bar-count",
      text: `${rows.length} categor${rows.length === 1 ? "y" : "ies"}` +
        (over ? ` · ${over} over budget` : "") +
        (unnoted ? ` · ${unnoted} without a note` : ""),
    });

    const sorts = bar.createDiv({ cls: "fin-category-sorts" });
    for (const option of SORTS) {
      const button = sorts.createEl("button", { cls: "fin-chip", text: option.label });
      button.toggleClass("is-active", this.sort === option.id);
      button.addEventListener("click", () => {
        this.sort = option.id;
        this.plugin.refreshBudgetView();
      });
    }

    const toggle = bar.createEl("button", { cls: "fin-chip", text: "Over budget" });
    toggle.toggleClass("is-active", this.overBudgetOnly);
    toggle.addEventListener("click", () => {
      this.overBudgetOnly = !this.overBudgetOnly;
      this.plugin.refreshBudgetView();
    });

    this.renderNewButton(bar);
  }

  private renderNewButton(container: HTMLElement): void {
    const add = container.createEl("button", { cls: "fin-chip mod-cta", text: "New category" });
    add.addEventListener("click", () => {
      new CategoryNameModal(this.plugin.app, {
        title: "New category",
        submit: "Create",
        value: "",
        taken: this.plugin.index.categories().map((entry) => entry.name),
        onSubmit: async (name) => {
          try {
            await this.plugin.createCategory(name);
            new Notice(`Added ${name}.`);
          } catch (error) {
            new Notice(`Could not create the category: ${(error as Error).message}`, 10000);
          }
        },
      }).open();
    });
  }

  private renderRow(list: HTMLElement, row: Row, map: Map<string, CategoryRecord>): void {
    const color = categoryColor(row.name, map);
    const container = list.createDiv({ cls: "fin-category-row" });
    container.toggleClass("is-over", this.overBudget(row));

    const glyph = container.createDiv({ cls: "fin-category-glyph" });
    const paintGlyph = (fill: string, icon: string) => {
      glyph.empty();
      glyph.style.setProperty("--fin-cat-color", fill);
      setIcon(glyph, icon);
    };
    paintGlyph(color, categoryIcon(row.name, map));

    const body = container.createDiv({ cls: "fin-category-body" });

    // --- head: the name, and what it cost ---
    const head = body.createDiv({ cls: "fin-category-head" });
    const name = head.createDiv({ cls: "fin-category-name", text: row.name });
    name.setAttribute("role", "button");
    name.setAttribute("aria-label", `Show the transactions filed under ${row.name}`);
    name.addEventListener("click", () => {
      this.plugin.store.set({ categories: [row.name] });
      this.plugin.showTransactionsTab();
    });

    const amounts = head.createDiv({ cls: "fin-category-amounts" });
    if (row.totals?.spent) {
      amounts.createSpan({ cls: "fin-out fin-amount", text: `−${formatAmount(row.totals.spent)}` });
    }
    if (row.totals?.received) {
      amounts.createSpan({ cls: "fin-in fin-amount", text: `+${formatAmount(row.totals.received)}` });
    }
    if (row.totals?.currency) {
      amounts.createSpan({ cls: "fin-category-currency", text: row.totals.currency });
    }

    // --- meta: how often, how recently, and how the budget is holding up ---
    const budget = this.budget(row);
    const spent = row.totals?.spent ?? 0;
    body.createDiv({
      cls: "fin-category-meta",
      text: [
        row.totals
          ? `${row.totals.count} transaction${row.totals.count === 1 ? "" : "s"}`
          : "Nothing this period",
        row.totals?.lastDate ? `last ${row.totals.lastDate}` : "",
        budget === null
          ? ""
          : spent > budget
            ? `${formatAmount(spent - budget)} over a ${formatAmount(budget)} budget`
            : `${formatAmount(budget - spent)} left of ${formatAmount(budget)}`,
        row.note ? "" : "no note yet",
      ].filter(Boolean).join(" · "),
    });

    if (budget !== null && budget > 0) {
      const track = body.createDiv({ cls: "fin-hbar-track" });
      const fill = track.createDiv({ cls: "fin-hbar-fill" });
      fill.style.width = `${Math.min(spent / budget, 1) * 100}%`;
      fill.style.background = spent > budget ? "var(--fin-over)" : color;
      track.toggleClass("is-over", spent > budget);
    }

    this.renderTools(body, row);
    if (row.note && this.expanded.has(row.name)) this.renderEditor(body, row.note, map, paintGlyph);
  }

  /**
   * A category with a note can be edited, renamed and deleted; one that exists
   * only because transactions name it gets the note written first, since there
   * is nowhere to keep a colour or a budget until then.
   */
  private renderTools(body: HTMLElement, row: Row): void {
    const tools = body.createDiv({ cls: "fin-category-actions" });

    if (!row.note) {
      const create = tools.createEl("button", { cls: "fin-chip", text: "Create its note" });
      create.addEventListener("click", async () => {
        create.disabled = true;
        try {
          await this.plugin.createCategory(row.name);
          this.expanded.add(row.name);
          new Notice(`Added ${row.name}.`);
        } catch (error) {
          new Notice(`Could not create the category: ${(error as Error).message}`, 10000);
          create.disabled = false;
        }
      });
      return;
    }

    const note = row.note;
    const open = this.expanded.has(row.name);
    const edit = tools.createEl("button", {
      cls: "fin-chip",
      text: open ? "Done" : "Edit",
      attr: { "aria-expanded": String(open) },
    });
    edit.toggleClass("is-active", open);
    edit.addEventListener("click", () => {
      if (open) this.expanded.delete(row.name);
      else this.expanded.add(row.name);
      this.plugin.refreshBudgetView();
    });

    const rename = tools.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": `Rename ${row.name}` },
    });
    setIcon(rename, "pencil");
    rename.addEventListener("click", () => {
      new CategoryNameModal(this.plugin.app, {
        title: `Rename ${row.name}`,
        submit: "Rename",
        value: row.name,
        taken: this.plugin.index.categories().map((entry) => entry.name),
        current: row.name,
        onSubmit: (wanted) => this.rename(note, wanted),
      }).open();
    });

    const remove = tools.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": `Delete ${row.name}` },
    });
    setIcon(remove, "trash");
    remove.addEventListener("click", () => {
      new DeleteCategoryModal(this.plugin.app, {
        category: note,
        held: this.heldBy(note.name),
        others: this.plugin.index.categories()
          .map((entry) => entry.name)
          .filter((other) => other !== note.name)
          .sort((a, b) => a.localeCompare(b)),
        onConfirm: (destination) => this.remove(note, destination),
      }).open();
    });
  }

  /** How many transactions a category holds, across the whole vault. */
  private heldBy(name: string): number {
    return this.plugin.index.transactions().filter((record) => record.category === name).length;
  }

  private renderEditor(
    body: HTMLElement,
    category: CategoryRecord,
    map: Map<string, CategoryRecord>,
    paintGlyph: (color: string, icon: string) => void,
  ): void {
    const editor = body.createDiv({ cls: "fin-category-editor" });

    // --- colour ---
    const swatches = editor.createDiv({ cls: "fin-swatches" });
    for (const color of CATEGORY_PALETTE) {
      const swatch = swatches.createEl("button", {
        cls: "fin-swatch",
        attr: { "aria-label": `Colour ${color}` },
      });
      swatch.style.background = color;
      swatch.toggleClass("is-active", category.color === color);
      swatch.addEventListener("click", async () => {
        try {
          await updateCategoryNote(this.plugin.app, category.path, { color });
          category.color = color;
          swatches.querySelectorAll(".fin-swatch").forEach((other) => other.removeClass("is-active"));
          swatch.addClass("is-active");
          paintGlyph(color, categoryIcon(category.name, map));
        } catch (error) {
          new Notice(`Could not save the colour: ${(error as Error).message}`);
        }
      });
    }

    // --- icon ---
    new Setting(editor).setName("Icon").addDropdown((dropdown) => {
      for (const icon of ICON_CHOICES) dropdown.addOption(icon, icon);
      dropdown.setValue(category.icon ?? categoryIcon(category.name, map));
      dropdown.onChange(async (value) => {
        try {
          await updateCategoryNote(this.plugin.app, category.path, { icon: value });
          category.icon = value;
          paintGlyph(categoryColor(category.name, map), value);
        } catch (error) {
          new Notice(`Could not save the icon: ${(error as Error).message}`);
        }
      });
    });

    // --- budget ---
    new Setting(editor)
      .setName("Monthly budget")
      .setDesc(category.currency)
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.inputMode = "decimal";
        text.setPlaceholder("none");
        text.setValue(category.monthlyBudget === null ? "" : String(category.monthlyBudget));
        text.inputEl.addEventListener("change", async () => {
          const raw = text.inputEl.value.trim();
          const parsed = raw === "" ? null : Number(raw.replaceAll(",", ""));
          if (parsed !== null && !Number.isFinite(parsed)) {
            new Notice("That budget is not a number.");
            return;
          }
          try {
            await updateCategoryNote(this.plugin.app, category.path, { monthly_budget: parsed });
            category.monthlyBudget = parsed;
          } catch (error) {
            new Notice(`Could not save the budget: ${(error as Error).message}`);
          }
        });
      });

    if (!this.rulesError) this.renderKeywords(editor, category);
  }

  /**
   * The words that file a message here on their own. This is the same list the
   * Merchants tab writes to a name at a time, opened up so a phrase no merchant
   * is named after can be added by hand.
   */
  private renderKeywords(editor: HTMLElement, category: CategoryRecord): void {
    const folded = category.name.trim().toLocaleLowerCase();
    const current = this.rules.rules.find(
      (rule) => String(rule.category).trim().toLocaleLowerCase() === folded,
    );
    new Setting(editor)
      .setName("Keywords")
      .setDesc("Separated by commas. A message containing one of them files itself here.")
      .addTextArea((area) => {
        area.inputEl.addClass("fin-keyword-input");
        area.inputEl.rows = 2;
        area.setPlaceholder("carrefour, seoudi");
        area.setValue((current?.keywords ?? []).join(", "));
        area.inputEl.addEventListener("change", async () => {
          const next = withKeywords(this.rules, category.name, area.inputEl.value.split(","));
          try {
            await saveCategoryRules(this.plugin.app, next);
            this.rules = next;
            // A word taken from another category leaves that box stale, so the
            // list is redrawn from what was actually saved.
            this.plugin.refreshBudgetView();
          } catch (error) {
            new Notice(`Could not save the keywords: ${(error as Error).message}`);
          }
        });
      });
  }

  /**
   * Renames the note first, so a name its file cannot take fails before
   * anything moves, then re-files the transactions and the keyword rule behind
   * it. A failure part-way through still says how far it got.
   */
  private async rename(category: CategoryRecord, name: string): Promise<void> {
    const from = category.name;
    let moved = 0;
    try {
      const path = await renameCategoryNote(this.plugin.app, category.path, name);
      moved = await this.plugin.recategorize(from, name);
      if (!this.rulesError) {
        const next = renamedCategory(this.rules, from, name);
        await saveCategoryRules(this.plugin.app, next);
        this.rules = next;
      }
      if (this.expanded.delete(from)) this.expanded.add(name);
      this.plugin.index.refreshPath(path);
      new Notice(
        `Renamed ${from} to ${name} and re-filed ${moved} transaction${moved === 1 ? "" : "s"}.`,
        6000,
      );
    } catch (error) {
      new Notice(
        `Renaming stopped after ${moved} transaction${moved === 1 ? "" : "s"}: ${(error as Error).message}`,
        10000,
      );
    }
  }

  /**
   * Moves the transactions before deleting the note, so nothing is left naming
   * a category that no longer exists even if the delete fails.
   *
   * The keywords follow the transactions to their new home, since a message
   * that used to belong here still belongs wherever these went. The exception
   * is Uncategorized, which is where a message lands when no keyword matches it
   * at all, so there the words are simply dropped.
   */
  private async remove(category: CategoryRecord, destination: string): Promise<void> {
    let moved = 0;
    try {
      moved = await this.plugin.recategorize(category.name, destination);
      if (!this.rulesError) {
        const next = destination === FALLBACK_CATEGORY
          ? withoutCategory(this.rules, category.name)
          : renamedCategory(this.rules, category.name, destination);
        await saveCategoryRules(this.plugin.app, next);
        this.rules = next;
      }
      await deleteCategoryNote(this.plugin.app, category.path);
      this.expanded.delete(category.name);
      new Notice(
        `Deleted ${category.name}. ${moved} transaction${moved === 1 ? "" : "s"} moved to ${destination}.`,
        6000,
      );
    } catch (error) {
      new Notice(
        `Deleting stopped after moving ${moved} transaction${moved === 1 ? "" : "s"}: ${(error as Error).message}`,
        10000,
      );
    }
  }
}
