import { Modal, Notice, Setting, setIcon } from "obsidian";
import type { App } from "obsidian";
import { deleteCategoryNote, renameCategoryNote } from "../../data/categories.ts";
import { loadCategoryRules, saveCategoryRules } from "../../data/category-rules.ts";
import { updateCategoryNote } from "../../data/write.ts";
import {
  categoryNameProblem, renamedCategory, withKeywords, withoutCategory,
} from "../../domain/categorize.ts";
import { CATEGORY_PALETTE, categoryColor, categoryIcon } from "../colors.ts";
import type FinanceAutomationPlugin from "../../main.ts";
import type { CategoryRecord } from "../../data/types.ts";
import type { CategoryRules } from "../../domain/categorize.ts";

/** A small, recognisable set from Obsidian's bundled Lucide icons. */
const ICON_CHOICES = [
  "shopping-cart", "utensils", "car", "receipt", "shopping-bag", "heart-pulse",
  "trending-up", "percent", "arrow-left-right", "home", "plane", "gift",
  "smartphone", "graduation-cap", "dumbbell", "circle-dashed",
];

/** Where the transactions of a deleted category go when nothing else is chosen. */
const FALLBACK_CATEGORY = "Uncategorized";

export class CategoryEditorModal extends Modal {
  private rules: CategoryRules = { rules: [] };
  private rulesError: string | null = null;
  private shape = "";
  private stopWatching: (() => void) | null = null;

  constructor(app: App, private readonly plugin: FinanceAutomationPlugin) {
    super(app);
  }

  override async onOpen(): Promise<void> {
    this.modalEl.addClass("fin-sheet");
    try {
      this.rules = await loadCategoryRules(this.app);
    } catch (error) {
      this.rulesError = (error as Error).message;
    }
    // A category that appears, is renamed or is deleted redraws the list; a
    // colour or budget saved into a note does not, so an edit in progress keeps
    // its focus.
    this.shape = this.shapeOfCategories();
    this.stopWatching = this.plugin.index.subscribe(() => {
      const shape = this.shapeOfCategories();
      if (shape === this.shape) return;
      this.shape = shape;
      this.draw();
    });
    this.draw();
  }

  override onClose(): void {
    this.stopWatching?.();
    this.stopWatching = null;
  }

  private shapeOfCategories(): string {
    return this.categories().map((entry) => `${entry.path} ${entry.name}`).join("");
  }

  private categories(): CategoryRecord[] {
    return [...this.plugin.index.categories()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private draw(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Categories and budgets" });

    const categories = this.categories();
    if (!categories.length) {
      contentEl.createEl("p", {
        cls: "fin-sheet-note",
        text: "No categories yet. Each one is a note under Budget/Settings/Categories/; " +
          "the button below writes it for you.",
      });
    }

    if (this.rulesError) {
      const problem = contentEl.createDiv({ cls: "fin-rule-error" });
      problem.createEl("strong", { text: "The keyword rules could not be read:" });
      problem.createEl("pre", { text: this.rulesError });
      problem.createEl("p", {
        text: "Fix Budget/Settings/Categories/rules.json, then reopen this window. " +
          "Colours and budgets can still be changed; keywords cannot, because saving " +
          "them would discard the rules that failed to load.",
      });
    }

    const counts = this.transactionCounts();
    for (const category of categories) this.renderRow(contentEl, category, counts);

    const actions = contentEl.createDiv({ cls: "fin-sheet-actions" });
    const add = actions.createEl("button", { cls: "mod-cta", text: "New category" });
    add.addEventListener("click", () => {
      new CategoryNameModal(this.app, {
        title: "New category",
        submit: "Create",
        value: "",
        taken: categories.map((entry) => entry.name),
        onSubmit: (name) => this.create(name),
      }).open();
    });
  }

  /** How many transactions each category holds, counted once for the whole list. */
  private transactionCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const record of this.plugin.index.transactions()) {
      counts.set(record.category, (counts.get(record.category) ?? 0) + 1);
    }
    return counts;
  }

  private renderRow(
    container: HTMLElement,
    category: CategoryRecord,
    counts: Map<string, number>,
  ): void {
    const map = new Map([[category.name, category]]);
    const row = container.createDiv({ cls: "fin-category-row" });

    const glyph = row.createDiv({ cls: "fin-category-glyph" });
    const paintGlyph = (color: string, icon: string) => {
      glyph.empty();
      glyph.style.setProperty("--fin-cat-color", color);
      setIcon(glyph, icon);
    };
    paintGlyph(categoryColor(category.name, map), categoryIcon(category.name, map));

    const body = row.createDiv({ cls: "fin-category-body" });

    const head = body.createDiv({ cls: "fin-category-head" });
    head.createDiv({ cls: "fin-category-name", text: category.name });
    const held = counts.get(category.name) ?? 0;
    head.createSpan({
      cls: "fin-category-count",
      text: `${held} transaction${held === 1 ? "" : "s"}`,
    });

    const tools = head.createDiv({ cls: "fin-category-actions" });
    const rename = tools.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": `Rename ${category.name}` },
    });
    setIcon(rename, "pencil");
    rename.addEventListener("click", () => {
      new CategoryNameModal(this.app, {
        title: `Rename ${category.name}`,
        submit: "Rename",
        value: category.name,
        taken: this.categories().map((entry) => entry.name),
        current: category.name,
        onSubmit: (name) => this.rename(category, name),
      }).open();
    });

    const remove = tools.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": `Delete ${category.name}` },
    });
    setIcon(remove, "trash");
    remove.addEventListener("click", () => {
      new DeleteCategoryModal(this.app, {
        category,
        held,
        others: this.categories()
          .map((entry) => entry.name)
          .filter((name) => name !== category.name),
        onConfirm: (destination) => this.remove(category, destination),
      }).open();
    });

    // --- colour ---
    const swatches = body.createDiv({ cls: "fin-swatches" });
    for (const color of CATEGORY_PALETTE) {
      const swatch = swatches.createEl("button", { cls: "fin-swatch", attr: { "aria-label": `Colour ${color}` } });
      swatch.style.background = color;
      swatch.toggleClass("is-active", category.color === color);
      swatch.addEventListener("click", async () => {
        try {
          await updateCategoryNote(this.app, category.path, { color });
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
    new Setting(body).setName("Icon").addDropdown((dropdown) => {
      for (const icon of ICON_CHOICES) dropdown.addOption(icon, icon);
      dropdown.setValue(category.icon ?? categoryIcon(category.name, map));
      dropdown.onChange(async (value) => {
        try {
          await updateCategoryNote(this.app, category.path, { icon: value });
          category.icon = value;
          paintGlyph(categoryColor(category.name, map), value);
        } catch (error) {
          new Notice(`Could not save the icon: ${(error as Error).message}`);
        }
      });
    });

    // --- budget ---
    new Setting(body)
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
            await updateCategoryNote(this.app, category.path, { monthly_budget: parsed });
            category.monthlyBudget = parsed;
          } catch (error) {
            new Notice(`Could not save the budget: ${(error as Error).message}`);
          }
        });
      });

    if (!this.rulesError) this.renderKeywords(body, category);
  }

  /**
   * The words that file a message here on their own. This is the same list the
   * Merchants tab writes to a name at a time, opened up so a phrase no merchant
   * is named after can be added by hand.
   */
  private renderKeywords(body: HTMLElement, category: CategoryRecord): void {
    const folded = category.name.trim().toLocaleLowerCase();
    const current = this.rules.rules.find(
      (rule) => String(rule.category).trim().toLocaleLowerCase() === folded,
    );
    new Setting(body)
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
            await saveCategoryRules(this.app, next);
            this.rules = next;
            // A word taken from another category leaves that box stale, so the
            // list is redrawn from what was actually saved.
            this.draw();
          } catch (error) {
            new Notice(`Could not save the keywords: ${(error as Error).message}`);
          }
        });
      });
  }

  private async create(name: string): Promise<void> {
    try {
      await this.plugin.createCategory(name);
      new Notice(`Added ${name}.`);
      this.draw();
    } catch (error) {
      new Notice(`Could not create the category: ${(error as Error).message}`, 10000);
    }
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
      const path = await renameCategoryNote(this.app, category.path, name);
      moved = await this.plugin.recategorize(from, name);
      if (!this.rulesError) {
        const next = renamedCategory(this.rules, from, name);
        await saveCategoryRules(this.app, next);
        this.rules = next;
      }
      this.plugin.index.refreshPath(path);
      new Notice(
        `Renamed ${from} to ${name} and re-filed ${moved} transaction${moved === 1 ? "" : "s"}.`,
        6000,
      );
      this.draw();
    } catch (error) {
      new Notice(
        `Renaming stopped after ${moved} transaction${moved === 1 ? "" : "s"}: ${(error as Error).message}`,
        10000,
      );
      this.draw();
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
        await saveCategoryRules(this.app, next);
        this.rules = next;
      }
      await deleteCategoryNote(this.app, category.path);
      new Notice(
        `Deleted ${category.name}. ${moved} transaction${moved === 1 ? "" : "s"} moved to ${destination}.`,
        6000,
      );
      this.draw();
    } catch (error) {
      new Notice(
        `Deleting stopped after moving ${moved} transaction${moved === 1 ? "" : "s"}: ${(error as Error).message}`,
        10000,
      );
      this.draw();
    }
  }
}

interface NamePrompt {
  title: string;
  submit: string;
  value: string;
  /** The names already in use, so a clash is caught before anything is written. */
  taken: string[];
  /** The name being edited, which is allowed to stay as it is. */
  current?: string;
  onSubmit: (name: string) => Promise<void>;
}

/** Asks for a category name and refuses one the vault could not file. */
export class CategoryNameModal extends Modal {
  private value: string;

  constructor(app: App, private readonly prompt: NamePrompt) {
    super(app);
    this.value = prompt.value;
  }

  override onOpen(): void {
    const { contentEl } = this;
    this.modalEl.addClass("fin-sheet");
    contentEl.empty();
    contentEl.createEl("h2", { text: this.prompt.title });

    const problem = contentEl.createEl("p", { cls: "fin-rule-error-text is-hidden" });

    const submit = async (): Promise<void> => {
      const name = this.value.trim();
      const reason = categoryNameProblem(name, this.prompt.taken, this.prompt.current ?? "");
      if (reason) {
        problem.setText(reason);
        problem.removeClass("is-hidden");
        return;
      }
      this.close();
      await this.prompt.onSubmit(name);
    };

    new Setting(contentEl)
      .setName("Name")
      .setDesc("This is the name on the note and on every transaction filed here.")
      .addText((text) => {
        text.setPlaceholder("Groceries").setValue(this.value);
        text.onChange((value) => {
          this.value = value;
          problem.addClass("is-hidden");
        });
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter") void submit();
        });
        window.setTimeout(() => text.inputEl.focus(), 0);
      });

    const actions = contentEl.createDiv({ cls: "fin-sheet-actions" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const save = actions.createEl("button", { cls: "mod-cta", text: this.prompt.submit });
    save.addEventListener("click", () => void submit());
  }
}

interface DeletePrompt {
  category: CategoryRecord;
  held: number;
  others: string[];
  onConfirm: (destination: string) => Promise<void>;
}

/**
 * Deleting a category asks where its transactions go rather than stranding
 * them: a note keeps whatever category it was given, and a name with no note
 * behind it becomes a category the editor cannot reach.
 */
export class DeleteCategoryModal extends Modal {
  private destination: string;

  constructor(app: App, private readonly prompt: DeletePrompt) {
    super(app);
    this.destination = prompt.others.includes(FALLBACK_CATEGORY)
      ? FALLBACK_CATEGORY
      : prompt.others[0] ?? FALLBACK_CATEGORY;
  }

  override onOpen(): void {
    const { contentEl } = this;
    this.modalEl.addClass("fin-sheet");
    contentEl.empty();
    contentEl.createEl("h2", { text: `Delete ${this.prompt.category.name}?` });
    contentEl.createEl("p", {
      cls: "fin-sheet-note",
      text: "The note goes to the trash. Nothing is removed from your transactions.",
    });

    if (this.prompt.held) {
      new Setting(contentEl)
        .setName(`Move ${this.prompt.held} transaction${this.prompt.held === 1 ? "" : "s"} to`)
        .addDropdown((dropdown) => {
          const options = this.prompt.others.includes(FALLBACK_CATEGORY)
            ? this.prompt.others
            : [FALLBACK_CATEGORY, ...this.prompt.others];
          for (const name of options) dropdown.addOption(name, name);
          dropdown.setValue(this.destination);
          dropdown.onChange((value) => { this.destination = value; });
        });
    }

    const actions = contentEl.createDiv({ cls: "fin-sheet-actions" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const confirm = actions.createEl("button", { cls: "mod-warning", text: "Delete" });
    confirm.addEventListener("click", () => {
      this.close();
      void this.prompt.onConfirm(this.destination);
    });
  }
}
