import { setIcon } from "obsidian";
import { deriveBalances, netWorthByCurrency, unknownAccountNames } from "../../domain/balances.ts";
import { applyFilter } from "../../domain/filter.ts";
import { cairoToday } from "../../domain/dates.ts";
import { formatAmount } from "../format.ts";
import { renderEmptyState } from "../components/empty-state.ts";
import type FinanceAutomationPlugin from "../../main.ts";

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
        "Copy Budget/Templates/Account.md into Budget/Accounts/ for each account.",
      );
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
        row.createSpan({ cls: "fin-networth-value fin-amount", text: formatAmount(value) });
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
        text: [item.account.institution, item.account.accountType].filter(Boolean).join(" · "),
      });

      const amount = head.createDiv({ cls: "fin-account-amount" });
      amount.createDiv({
        cls: `fin-amount fin-account-balance ${item.balance < 0 ? "fin-out" : ""}`,
        text: formatAmount(item.balance),
      });
      amount.createDiv({ cls: "fin-account-currency", text: item.account.currency });

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
          `Statement differs by ${formatAmount(item.drift)} ${item.account.currency}` +
          (item.account.referenceUpdatedAt ? ` (as of ${item.account.referenceUpdatedAt.slice(0, 10)})` : ""),
        );
      }

      card.addEventListener("click", () => {
        this.plugin.store.set({ accounts: [item.account.name] });
        this.plugin.showTransactionsTab();
      });
    }

    // --- unrecognised names ---
    const unknown = unknownAccountNames(accounts, allRecords);
    if (unknown.length) {
      const box = container.createDiv({ cls: "fin-unknown" });
      box.createEl("strong", { text: "Transactions reference accounts that are not set up:" });
      box.createEl("p", { text: unknown.join(", ") });
      box.createEl("p", {
        cls: "fin-sheet-note",
        text: "Add them to Budget/Settings/accounts.json and create a note in Budget/Accounts/ so their balances are tracked.",
      });
    }
  }
}
