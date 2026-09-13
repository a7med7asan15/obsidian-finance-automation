import { Modal, Setting } from "obsidian";
import type { App } from "obsidian";
import { categoryNameProblem } from "../../domain/categorize.ts";
import type { CategoryRecord } from "../../data/types.ts";

/** Where the transactions of a deleted category go when nothing else is chosen. */
const FALLBACK_CATEGORY = "Uncategorized";

/**
 * The two prompts category editing needs: one that asks for a name and refuses
 * one the vault could not file, and one that asks where the transactions of a
 * category about to be deleted should go. The editing itself lives on the
 * Categories tab, next to what each category cost.
 */

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
