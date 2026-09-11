import { Modal, Notice, Setting } from "obsidian";
import type { App } from "obsidian";
import { updateTransaction } from "../../data/write.ts";
import { formatMoney } from "../format.ts";
import type FinanceAutomationPlugin from "../../main.ts";
import type { TransactionRecord, TransactionType } from "../../data/types.ts";

const TYPE_CHOICES: Record<string, string> = {
  debit: "Spending", credit: "Income", transfer: "Transfer", fee: "Fee",
};

export class TransactionSheet extends Modal {
  private draft: {
    amount: string; currency: string; date: string; time: string;
    fromAccount: string; toAccount: string; category: string;
    merchant: string; type: TransactionType;
    excluded: boolean; excludeReason: string;
  };

  constructor(
    app: App,
    private readonly plugin: FinanceAutomationPlugin,
    private readonly record: TransactionRecord,
  ) {
    super(app);
    this.draft = {
      amount: record.amount === null ? "" : String(record.amount),
      currency: record.currency,
      date: record.date ?? "",
      time: record.time ?? "",
      fromAccount: record.fromAccount,
      toAccount: record.toAccount,
      category: record.category,
      merchant: record.merchant,
      type: record.type,
      excluded: record.excluded,
      excludeReason: record.excludeReason,
    };
  }

  override onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("fin-sheet");
    contentEl.empty();

    contentEl.createEl("h2", {
      text: this.record.merchant || this.record.category || "Transaction",
    });

    const accounts = this.plugin.index.accounts().map((account) => account.name).sort();
    const categories = this.plugin.index.categories().map((category) => category.name).sort();

    new Setting(contentEl).setName("Amount").addText((text) =>
      text.setValue(this.draft.amount).onChange((value) => { this.draft.amount = value; }),
    ).addText((text) =>
      text.setPlaceholder("EGP").setValue(this.draft.currency)
        .onChange((value) => { this.draft.currency = value; }),
    );

    new Setting(contentEl).setName("Date").addText((text) => {
      text.inputEl.type = "date";
      text.setValue(this.draft.date).onChange((value) => { this.draft.date = value; });
    }).addText((text) => {
      text.inputEl.type = "time";
      text.setValue(this.draft.time).onChange((value) => { this.draft.time = value; });
    });

    new Setting(contentEl).setName("Type").addDropdown((dropdown) => {
      dropdown.addOption("", "Unknown");
      for (const [value, label] of Object.entries(TYPE_CHOICES)) dropdown.addOption(value, label);
      dropdown.setValue(this.draft.type)
        .onChange((value) => { this.draft.type = value as TransactionType; });
    });

    new Setting(contentEl).setName("Category").addDropdown((dropdown) => {
      const options = categories.length ? categories : ["Uncategorized"];
      if (!options.includes(this.draft.category)) options.unshift(this.draft.category);
      for (const name of options) dropdown.addOption(name, name);
      dropdown.setValue(this.draft.category).onChange((value) => { this.draft.category = value; });
    });

    this.accountSetting(contentEl, "From account", accounts, "fromAccount");
    this.accountSetting(contentEl, "To account", accounts, "toAccount");

    new Setting(contentEl).setName("Merchant").addText((text) =>
      text.setValue(this.draft.merchant).onChange((value) => { this.draft.merchant = value; }),
    );

    new Setting(contentEl)
      .setName("Exclude from calculations")
      .setDesc("The transaction stays in the list but counts towards nothing.")
      .addToggle((toggle) =>
        toggle.setValue(this.draft.excluded).onChange((value) => {
          this.draft.excluded = value;
          reasonSetting.settingEl.toggleClass("is-hidden", !value);
        }),
      );

    const reasonSetting = new Setting(contentEl).setName("Reason").addText((text) =>
      text.setPlaceholder("Did not happen").setValue(this.draft.excludeReason)
        .onChange((value) => { this.draft.excludeReason = value; }),
    );
    reasonSetting.settingEl.toggleClass("is-hidden", !this.draft.excluded);

    if (this.record.excludeSource === "rule") {
      contentEl.createEl("p", {
        cls: "fin-sheet-note",
        text: `Excluded by the rule "${this.record.excludeRuleId}". Changing it here makes the decision manual, and rules will stop touching it.`,
      });
    }

    if (this.record.smsMessage) {
      const details = contentEl.createEl("details", { cls: "fin-sheet-sms" });
      details.createEl("summary", { text: "Original SMS" });
      details.createEl("pre", { text: this.record.smsMessage });
    }

    const meta = contentEl.createDiv({ cls: "fin-sheet-meta" });
    meta.createSpan({ text: `Status: ${this.record.status}` });
    if (this.record.amount !== null) {
      meta.createSpan({ text: formatMoney(this.record.amount, this.record.currency) });
    }

    const actions = contentEl.createDiv({ cls: "fin-sheet-actions" });

    const open = actions.createEl("button", { text: "Open note" });
    open.addEventListener("click", () => {
      this.close();
      void this.app.workspace.openLinkText(this.record.path, "", false);
    });

    const save = actions.createEl("button", { cls: "mod-cta", text: "Save" });
    save.addEventListener("click", () => void this.save());
  }

  private accountSetting(
    container: HTMLElement,
    label: string,
    accounts: string[],
    field: "fromAccount" | "toAccount",
  ): void {
    new Setting(container).setName(label).addDropdown((dropdown) => {
      dropdown.addOption("", "—");
      const options = [...accounts];
      const current = this.draft[field];
      if (current && !options.includes(current)) options.unshift(current);
      for (const name of options) dropdown.addOption(name, name);
      dropdown.setValue(current).onChange((value) => { this.draft[field] = value; });
    });
  }

  private async save(): Promise<void> {
    const amount = this.draft.amount.trim() === "" ? null : Number(this.draft.amount.replaceAll(",", ""));
    if (amount !== null && !Number.isFinite(amount)) {
      new Notice("That amount is not a number.");
      return;
    }

    const time = this.draft.time || "00:00";
    const timestamp = this.draft.date ? `${this.draft.date}T${time}:00` : this.record.timestamp;

    try {
      await updateTransaction(this.app, this.record.path, {
        amount,
        currency: this.draft.currency.trim().toUpperCase(),
        timestamp,
        from_account: this.draft.fromAccount,
        to_account: this.draft.toAccount,
        category: this.draft.category,
        merchant: this.draft.merchant,
        transaction_type: this.draft.type,
        excluded: this.draft.excluded ? true : null,
        exclude_reason: this.draft.excluded ? (this.draft.excludeReason || "Excluded by hand") : null,
        // Editing by hand always makes the decision manual, so no rule will undo it.
        exclude_source: this.draft.excluded ? "manual" : null,
        exclude_rule_id: null,
      });
      this.close();
    } catch (error) {
      new Notice(`Could not save: ${(error as Error).message}`);
    }
  }
}
