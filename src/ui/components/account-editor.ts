import { Modal, Notice, Setting } from "obsidian";
import type { App } from "obsidian";
import { createAccountNote, renameAccountNote } from "../../data/accounts.ts";
import { updateAccountNote } from "../../data/write.ts";
import { cairoNow } from "../../domain/dates.ts";
import { noteNameProblem } from "../../domain/names.ts";
import type { AccountNoteChanges } from "../../data/write.ts";
import type { AccountRecord } from "../../data/types.ts";
import type FinanceAutomationPlugin from "../../main.ts";

const ACCOUNT_TYPES: Array<{ id: string; label: string }> = [
  { id: "bank", label: "Bank account" },
  { id: "card", label: "Credit card" },
  { id: "wallet", label: "Wallet" },
  { id: "cash", label: "Cash" },
];

interface Draft {
  name: string;
  institution: string;
  accountType: string;
  currency: string;
  cardEndings: string;
  aliases: string;
  openingBalance: string;
  openingDate: string;
  referenceBalance: string;
  active: boolean;
  includeInNetWorth: boolean;
}

/** A comma-separated box back into the list its frontmatter key holds. */
function toList(text: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const raw of String(text ?? "").split(",")) {
    const value = raw.trim();
    const folded = value.toLocaleLowerCase();
    if (!value || seen.has(folded)) continue;
    seen.add(folded);
    items.push(value);
  }
  return items;
}

function draftOf(account: AccountRecord | null): Draft {
  if (!account) {
    return {
      name: "", institution: "", accountType: "bank", currency: "EGP",
      cardEndings: "", aliases: "", openingBalance: "0", openingDate: "",
      referenceBalance: "", active: true, includeInNetWorth: true,
    };
  }
  return {
    name: account.name,
    institution: account.institution,
    accountType: account.accountType || "bank",
    currency: account.currency,
    cardEndings: account.cardEndings.join(", "),
    aliases: account.aliases.join(", "),
    openingBalance: String(account.openingBalance),
    openingDate: account.openingDate ?? "",
    referenceBalance: account.referenceBalance === null ? "" : String(account.referenceBalance),
    active: account.active,
    includeInNetWorth: account.includeInNetWorth,
  };
}

/**
 * Everything an account note holds, in one form.
 *
 * Renaming is the reason this is a modal rather than a row of inline controls:
 * an account is named by its note *and* by every transaction that mentions it,
 * so a new name has to move the file and re-file the transactions in one
 * deliberate step. Everything else is a frontmatter write.
 */
export class AccountEditorModal extends Modal {
  private readonly draft: Draft;
  private saving = false;

  constructor(
    app: App,
    private readonly plugin: FinanceAutomationPlugin,
    /** The account being edited, or null to write a new one. */
    private readonly account: AccountRecord | null,
    /** A name to start a new account with, from the unrecognised-names list. */
    suggestedName = "",
  ) {
    super(app);
    this.draft = draftOf(account);
    if (!account && suggestedName) this.draft.name = suggestedName;
  }

  override onOpen(): void {
    const { contentEl } = this;
    this.modalEl.addClass("fin-sheet");
    contentEl.empty();
    contentEl.createEl("h2", { text: this.account ? `Edit ${this.account.name}` : "New account" });

    const problem = contentEl.createEl("p", { cls: "fin-rule-error-text is-hidden" });
    const clearProblem = () => problem.addClass("is-hidden");

    new Setting(contentEl)
      .setName("Name")
      .setDesc("The name on the note and on every transaction filed to this account.")
      .addText((text) => {
        text.setPlaceholder("CIB").setValue(this.draft.name).onChange((value) => {
          this.draft.name = value;
          clearProblem();
        });
        window.setTimeout(() => text.inputEl.focus(), 0);
      });

    new Setting(contentEl)
      .setName("Bank")
      .addText((text) =>
        text.setPlaceholder("CIB").setValue(this.draft.institution)
          .onChange((value) => { this.draft.institution = value; }),
      );

    new Setting(contentEl).setName("Type").addDropdown((dropdown) => {
      for (const type of ACCOUNT_TYPES) dropdown.addOption(type.id, type.label);
      // A type typed into the note by hand is offered as it is, so opening the
      // editor never silently changes it.
      if (!ACCOUNT_TYPES.some((type) => type.id === this.draft.accountType)) {
        dropdown.addOption(this.draft.accountType, this.draft.accountType);
      }
      dropdown.setValue(this.draft.accountType)
        .onChange((value) => { this.draft.accountType = value; });
    });

    new Setting(contentEl).setName("Currency").addText((text) =>
      text.setPlaceholder("EGP").setValue(this.draft.currency)
        .onChange((value) => { this.draft.currency = value; }),
    );

    new Setting(contentEl)
      .setName("Card endings")
      .setDesc(
        "Separated by commas. Every digit group the bank uses for this account — a debit " +
        "card, a credit card and the account number can all belong here, and a message " +
        "naming any of them files itself to this account.",
      )
      .addText((text) =>
        text.setPlaceholder("0779, 1934").setValue(this.draft.cardEndings)
          .onChange((value) => { this.draft.cardEndings = value; }),
      );

    new Setting(contentEl)
      .setName("Other names")
      .setDesc("Separated by commas. Wordings the bank uses for this account in its messages.")
      .addText((text) =>
        text.setPlaceholder("bank, current account").setValue(this.draft.aliases)
          .onChange((value) => { this.draft.aliases = value; }),
      );

    new Setting(contentEl)
      .setName("Starting balance")
      .setDesc("What the account held on the starting date. Every transaction since is added to it.")
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.inputMode = "decimal";
        text.setPlaceholder("0").setValue(this.draft.openingBalance)
          .onChange((value) => {
            this.draft.openingBalance = value;
            clearProblem();
          });
      })
      .addText((text) => {
        text.inputEl.type = "date";
        text.setValue(this.draft.openingDate)
          .onChange((value) => { this.draft.openingDate = value; });
      });

    new Setting(contentEl)
      .setName("Statement balance")
      .setDesc(
        "Optional. The figure on your last statement; the Accounts tab shows how far the " +
        "derived balance has drifted from it.",
      )
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.inputMode = "decimal";
        text.setPlaceholder("none").setValue(this.draft.referenceBalance)
          .onChange((value) => {
            this.draft.referenceBalance = value;
            clearProblem();
          });
      });

    new Setting(contentEl)
      .setName("In use")
      .setDesc("A closed account keeps its transactions but leaves the accounts tab.")
      .addToggle((toggle) =>
        toggle.setValue(this.draft.active).onChange((value) => { this.draft.active = value; }),
      );

    new Setting(contentEl)
      .setName("Count towards net worth")
      .addToggle((toggle) =>
        toggle.setValue(this.draft.includeInNetWorth)
          .onChange((value) => { this.draft.includeInNetWorth = value; }),
      );

    const actions = contentEl.createDiv({ cls: "fin-sheet-actions" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const save = actions.createEl("button", {
      cls: "mod-cta",
      text: this.account ? "Save" : "Create",
    });
    save.addEventListener("click", () => {
      if (this.saving) return;
      const reason = this.problemWith();
      if (reason) {
        problem.setText(reason);
        problem.removeClass("is-hidden");
        return;
      }
      this.saving = true;
      save.disabled = true;
      void this.save().finally(() => {
        this.saving = false;
        save.disabled = false;
      });
    });
  }

  /** The reason the form cannot be saved, or null when it can. */
  private problemWith(): string | null {
    const taken = this.plugin.index.accounts().map((account) => account.name);
    const nameProblem = noteNameProblem(this.draft.name, taken, this.account?.name ?? "", "account");
    if (nameProblem) return nameProblem;
    if (this.number(this.draft.openingBalance) === null) {
      return "The starting balance is not a number.";
    }
    if (this.draft.referenceBalance.trim() && this.number(this.draft.referenceBalance) === null) {
      return "The statement balance is not a number.";
    }
    return null;
  }

  private number(raw: string): number | null {
    const text = String(raw ?? "").trim();
    if (!text) return 0;
    const parsed = Number(text.replaceAll(",", ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private async save(): Promise<void> {
    const name = this.draft.name.trim();
    const changes: AccountNoteChanges = {
      currency: this.draft.currency.trim().toUpperCase() || "EGP",
      account_type: this.draft.accountType || "bank",
      institution: this.draft.institution.trim(),
      card_endings: toList(this.draft.cardEndings),
      aliases: toList(this.draft.aliases),
      opening_balance: this.number(this.draft.openingBalance) ?? 0,
      opening_date: this.draft.openingDate.trim() || null,
      active: this.draft.active,
      include_in_net_worth: this.draft.includeInNetWorth,
    };

    const reference = this.draft.referenceBalance.trim()
      ? this.number(this.draft.referenceBalance)
      : null;
    changes.balance = reference;
    // The statement date is only meaningful next to a statement figure, and
    // only worth rewriting when that figure actually moved.
    if (reference === null) changes.balance_updated_at = null;
    else if (reference !== this.account?.referenceBalance) changes.balance_updated_at = cairoNow();

    try {
      if (!this.account) {
        const path = await createAccountNote(this.app, {
          name,
          currency: changes.currency ?? "EGP",
          accountType: changes.account_type ?? "bank",
          institution: changes.institution ?? "",
          cardEndings: changes.card_endings ?? [],
          aliases: changes.aliases ?? [],
          openingBalance: changes.opening_balance ?? 0,
          openingDate: changes.opening_date ?? "",
          referenceBalance: reference,
          active: this.draft.active,
          includeInNetWorth: this.draft.includeInNetWorth,
        });
        if (changes.balance_updated_at) {
          await updateAccountNote(this.app, path, {
            balance_updated_at: changes.balance_updated_at,
          });
        }
        this.plugin.index.refreshPath(path);
        new Notice(`Added ${name}.`);
        this.close();
        return;
      }

      // The note moves first: a name whose file is taken fails before anything
      // else has changed. Only then do the transactions follow it, because a
      // balance is matched by name and would otherwise land nowhere.
      const from = this.account.name;
      let path = this.account.path;
      let refiled = 0;
      if (name !== from) {
        path = await renameAccountNote(this.app, path, name);
        refiled = await this.plugin.renameAccountReferences(from, name);
      }
      await updateAccountNote(this.app, path, changes);
      this.plugin.index.refreshPath(path);
      new Notice(
        name === from
          ? `Saved ${name}.`
          : `Renamed ${from} to ${name} and re-filed ${refiled} transaction${refiled === 1 ? "" : "s"}.`,
        6000,
      );
      this.close();
    } catch (error) {
      new Notice(`Could not save the account: ${(error as Error).message}`, 10000);
    }
  }
}
