import { setIcon } from "obsidian";
import { deriveBalances, netWorthByCurrency, unknownAccountNames } from "../../domain/balances.ts";
import { applyFilter } from "../../domain/filter.ts";
import { cairoToday } from "../../domain/dates.ts";
import { formatAmount, formatSignedAmount } from "../format.ts";
import { renderEmptyState } from "../components/empty-state.ts";
import { AccountEditorModal } from "../components/account-editor.ts";
import type FinanceAutomationPlugin from "../../main.ts";
import type { AccountRecord } from "../../data/types.ts";

const TYPE_ICONS: Record<string, string> = {
  bank: "landmark", card: "credit-card", wallet: "wallet", cash: "banknote",
};

export class AccountsTab {
  constructor(private readonly plugin: FinanceAutomationPlugin) {}

  render(container: HTMLElement): void {
    const accounts = this.plugin.index.accounts();
    const allRecords = this.plugin.index.transactions();

    if (!accounts.length) {
      renderEmptyState(
        container, "wallet", "No accounts yet",
        "An account is a note under Budget/Accounts/ holding its card endings and its " +
        "starting balance. Add the first one below.",
      );
      this.renderNewButton(container);
      return;
    }

    // Balances always use every transaction ever — a balance filtered to one
    // month would be meaningless. The period only scopes the in/out figures.
    const balances = deriveBalances(accounts, allRecords);
    const inPeriod = applyFilter(allRecords, { ...this.plugin.store.get(), excluded: "hide" }, cairoToday());
    const periodBalances = new Map(
      deriveBalances(accounts, inPeriod).map((item) => [item.account.path, item]),
    );

    // --- net worth ---
    const netWorth = netWorthByCurrency(balances);
    if (netWorth.size) {
      const header = container.createDiv({ cls: "fin-networth" });
      header.createDiv({ cls: "fin-networth-label", text: "Net worth" });
      for (const [currency, value] of [...netWorth].sort()) {
        const row = header.createDiv({ cls: "fin-networth-row" });
        row.createSpan({
          cls: `fin-networth-value fin-amount ${value < 0 ? "fin-out" : ""}`,
          text: formatSignedAmount(value),
        });
        row.createSpan({ cls: "fin-networth-currency", text: currency });
      }
    }

    // --- account cards ---
    const list = container.createDiv({ cls: "fin-account-list" });
    for (const item of [...balances].sort((a, b) => b.balance - a.balance)) {
      const card = list.createDiv({ cls: "fin-account-card" });

      const head = card.createDiv({ cls: "fin-account-head" });
      const icon = head.createDiv({ cls: "fin-account-icon" });
      setIcon(icon, TYPE_ICONS[item.account.accountType] ?? "wallet");

      const names = head.createDiv({ cls: "fin-account-names" });
      names.createDiv({ cls: "fin-account-name", text: item.account.name });
      names.createDiv({
        cls: "fin-account-type",
        text: [
          item.account.institution,
          item.account.accountType,
          item.account.cardEndings.length ? `··${item.account.cardEndings[0]}` : "",
        ].filter(Boolean).join(" · "),
      });

      const amount = head.createDiv({ cls: "fin-account-amount" });
      amount.createDiv({
        cls: `fin-amount fin-account-balance ${item.balance < 0 ? "fin-out" : ""}`,
        text: formatSignedAmount(item.balance),
      });
      amount.createDiv({ cls: "fin-account-currency", text: item.account.currency });

      this.renderEditButton(head, item.account);

      const period = periodBalances.get(item.account.path);
      if (period) {
        const flow = card.createDiv({ cls: "fin-account-flow" });
        flow.createSpan({ cls: "fin-in fin-amount", text: `+${formatAmount(period.moneyIn)}` });
        flow.createSpan({ cls: "fin-out fin-amount", text: `−${formatAmount(period.moneyOut)}` });
        flow.createSpan({
          cls: "fin-account-count",
          text: `${period.transactionCount} this period`,
        });
      }

      if (item.drift !== null && Math.abs(item.drift) > 0.005) {
        const drift = card.createDiv({ cls: "fin-account-drift" });
        drift.setText(
          `Statement is ${formatAmount(item.drift)} ${item.account.currency} ` +
          `${item.drift > 0 ? "higher" : "lower"} than these transactions` +
          (item.account.referenceUpdatedAt ? ` (as of ${item.account.referenceUpdatedAt.slice(0, 10)})` : ""),
        );
      }

      card.addEventListener("click", () => {
        this.plugin.store.set({ accounts: [item.account.name] });
        this.plugin.showTransactionsTab();
      });
    }

    this.renderNewButton(container);

    // --- unrecognised names ---
    const unknown = unknownAccountNames(accounts, allRecords);
    if (unknown.length) {
      const box = container.createDiv({ cls: "fin-unknown" });
      box.createEl("strong", { text: "Transactions reference accounts that are not set up:" });
      const names = box.createDiv({ cls: "fin-unknown-names" });
      for (const name of unknown) {
        // The name is already spelt the way the transactions spell it, so
        // starting the note from it is what makes the two meet.
        const button = names.createEl("button", { cls: "fin-chip", text: `Set up ${name}` });
        button.addEventListener("click", () => {
          new AccountEditorModal(this.plugin.app, this.plugin, null, name).open();
        });
      }
      box.createEl("p", {
        cls: "fin-sheet-note",
        text: "Until an account exists under that name, its transactions move no balance.",
      });
    }
  }

  /**
   * Editing sits on the card rather than behind it: tapping the card asks what
   * an account spent, which is the common question, so changing what the
   * account *is* needs its own target.
   */
  private renderEditButton(head: HTMLElement, account: AccountRecord): void {
    const edit = head.createEl("button", {
      cls: "clickable-icon fin-account-edit",
      attr: { "aria-label": `Edit ${account.name}` },
    });
    setIcon(edit, "pencil");
    edit.addEventListener("click", (event) => {
      event.stopPropagation();
      new AccountEditorModal(this.plugin.app, this.plugin, account).open();
    });
  }

  private renderNewButton(container: HTMLElement): void {
    const actions = container.createDiv({ cls: "fin-account-actions" });
    const add = actions.createEl("button", { cls: "fin-more", text: "New account" });
    add.addEventListener("click", () => {
      new AccountEditorModal(this.plugin.app, this.plugin, null).open();
    });
  }
}
