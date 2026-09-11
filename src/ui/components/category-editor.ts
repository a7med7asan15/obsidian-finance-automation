import { Modal, Notice, Setting, setIcon } from "obsidian";
import type { App } from "obsidian";
import { updateCategoryNote } from "../../data/write.ts";
import { CATEGORY_PALETTE, categoryColor, categoryIcon } from "../colors.ts";
import type FinanceAutomationPlugin from "../../main.ts";
import type { CategoryRecord } from "../../data/types.ts";

/** A small, recognisable set from Obsidian's bundled Lucide icons. */
const ICON_CHOICES = [
  "shopping-cart", "utensils", "car", "receipt", "shopping-bag", "heart-pulse",
  "trending-up", "percent", "arrow-left-right", "home", "plane", "gift",
  "smartphone", "graduation-cap", "dumbbell", "circle-dashed",
];

export class CategoryEditorModal extends Modal {
  constructor(app: App, private readonly plugin: FinanceAutomationPlugin) {
    super(app);
  }

  override onOpen(): void {
    this.modalEl.addClass("fin-sheet");
    this.draw();
  }

  private draw(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Categories and budgets" });

    const categories = [...this.plugin.index.categories()].sort((a, b) => a.name.localeCompare(b.name));
    if (!categories.length) {
      contentEl.createEl("p", {
        text: "No category notes found. Add notes with `type: category` under Budget/Settings/Categories/.",
      });
      return;
    }

    for (const category of categories) this.renderRow(contentEl, category);
  }

  private renderRow(container: HTMLElement, category: CategoryRecord): void {
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
    body.createDiv({ cls: "fin-category-name", text: category.name });

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
  }
}
