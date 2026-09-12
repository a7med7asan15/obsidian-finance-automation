import { Modal, Notice, Setting } from "obsidian";
import type { App } from "obsidian";
import { createManualTransaction } from "../../data/create.ts";
import { cairoToday } from "../../domain/dates.ts";
import { ROLE_LABELS, roleForType } from "../../domain/counterparty.ts";
import type FinanceAutomationPlugin from "../../main.ts";
import type { TransactionType } from "../../data/types.ts";

export class AddTransactionModal extends Modal {
  private draft = {
    amount: "",
    currency: "EGP",
    date: cairoToday(),
    time: new Date().toTimeString().slice(0, 5),
    type: "debit" as TransactionType,
    account: "",
    toAccount: "",
    category: "Uncategorized",
    counterparty: "",
    note: "",
  };

  constructor(app: App, private readonly plugin: FinanceAutomationPlugin) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("fin-sheet");
    contentEl.empty();
    contentEl.createEl("h2", { text: "Add transaction" });

    const accounts = this.plugin.index.accounts().map((account) => account.name).sort();
    const categories = this.plugin.index.categories().map((category) => category.name).sort();
    this.draft.account = accounts[0] ?? "";
    this.draft.currency = this.plugin.index.accounts()[0]?.currency ?? "EGP";

    new Setting(contentEl).setName("Amount").addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.inputMode = "decimal";
      text.inputEl.focus();
      text.setValue(this.draft.amount).onChange((value) => { this.draft.amount = value; });
    }).addText((text) =>
      text.setValue(this.draft.currency).onChange((value) => { this.draft.currency = value; }),
    );

    new Setting(contentEl).setName("Type").addDropdown((dropdown) => {
      dropdown.addOption("debit", "Spending");
      dropdown.addOption("credit", "Income");
      dropdown.addOption("transfer", "Transfer");
      dropdown.addOption("fee", "Fee");
      dropdown.setValue(this.draft.type).onChange((value) => {
        this.draft.type = value as TransactionType;
        toAccountSetting.settingEl.toggleClass("is-hidden", value !== "transfer");
        // A shop, a person you paid, and whoever paid you are the same box with
        // three names; the type in hand decides which one it wears.
        partySetting.setName(ROLE_LABELS[roleForType(this.draft.type)]);
      });
    });

    new Setting(contentEl).setName("Account").addDropdown((dropdown) => {
      const options = accounts.length ? accounts : ["Cash"];
      for (const name of options) dropdown.addOption(name, name);
      // The draft has to agree with what the dropdown shows, or saving a vault
      // with no account notes would be rejected for an account you can see.
      this.draft.account = this.draft.account || options[0];
      dropdown.setValue(this.draft.account)
        .onChange((value) => { this.draft.account = value; });
    });

    const toAccountSetting = new Setting(contentEl).setName("To account").addDropdown((dropdown) => {
      dropdown.addOption("", "—");
      for (const name of accounts) dropdown.addOption(name, name);
      dropdown.setValue(this.draft.toAccount).onChange((value) => { this.draft.toAccount = value; });
    });
    toAccountSetting.settingEl.toggleClass("is-hidden", this.draft.type !== "transfer");

    new Setting(contentEl).setName("Category").addDropdown((dropdown) => {
      const options = categories.length ? categories : ["Uncategorized"];
      for (const name of options) dropdown.addOption(name, name);
      dropdown.setValue(options.includes(this.draft.category) ? this.draft.category : options[0])
        .onChange((value) => { this.draft.category = value; });
    });

    const partySetting = new Setting(contentEl)
      .setName(ROLE_LABELS[roleForType(this.draft.type)])
      .addText((text) =>
        text.setPlaceholder("Who was on the other side?").setValue(this.draft.counterparty)
          .onChange((value) => { this.draft.counterparty = value; }),
      );

    new Setting(contentEl).setName("Date").addText((text) => {
      text.inputEl.type = "date";
      text.setValue(this.draft.date).onChange((value) => { this.draft.date = value; });
    }).addText((text) => {
      text.inputEl.type = "time";
      text.setValue(this.draft.time).onChange((value) => { this.draft.time = value; });
    });

    new Setting(contentEl).setName("Note").addTextArea((text) =>
      text.setValue(this.draft.note).onChange((value) => { this.draft.note = value; }),
    );

    const actions = contentEl.createDiv({ cls: "fin-sheet-actions" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const save = actions.createEl("button", { cls: "mod-cta", text: "Add" });
    save.addEventListener("click", () => void this.save());
  }

  private async save(): Promise<void> {
    const amount = Number(this.draft.amount.replaceAll(",", ""));
    if (!Number.isFinite(amount) || amount === 0) {
      new Notice("Enter an amount.");
      return;
    }
    if (!this.draft.account) {
      new Notice("Choose an account.");
      return;
    }

    const isCredit = this.draft.type === "credit";
    try {
      const file = await createManualTransaction(this.app, {
        timestamp: `${this.draft.date}T${this.draft.time || "00:00"}:00`,
        amount: Math.abs(amount),
        currency: this.draft.currency.trim().toUpperCase() || "EGP",
        fromAccount: isCredit ? "" : this.draft.account,
        toAccount: isCredit ? this.draft.account : this.draft.toAccount,
        category: this.draft.category,
        counterparty: this.draft.counterparty,
        type: this.draft.type,
        note: this.draft.note,
      });
      new Notice(`Added ${file.basename}.`);
      this.close();
    } catch (error) {
      new Notice(`Could not add the transaction: ${(error as Error).message}`);
    }
  }
}
