import { Menu, setIcon } from "obsidian";
import { distinctAccounts, distinctCategories } from "../../domain/filter.ts";
import type { FilterStore } from "../../store/filter-store.ts";
import type { ExcludedMode, TransactionRecord, TransactionStatus, TransactionType } from "../../data/types.ts";

const TYPE_OPTIONS: Array<{ value: TransactionType; label: string }> = [
  { value: "debit", label: "Spending" },
  { value: "credit", label: "Income" },
  { value: "transfer", label: "Transfers" },
  { value: "fee", label: "Fees" },
];

const STATUS_OPTIONS: Array<{ value: TransactionStatus; label: string }> = [
  { value: "parsed", label: "Parsed" },
  { value: "needs_review", label: "Needs review" },
  { value: "pending", label: "Pending" },
];

const EXCLUDED_OPTIONS: Array<{ value: ExcludedMode; label: string }> = [
  { value: "hide", label: "Hide excluded" },
  { value: "show", label: "Show excluded" },
  { value: "only", label: "Only excluded" },
];

export class FilterBar {
  private expanded = false;

  private allRecords: TransactionRecord[];

  constructor(
    private readonly store: FilterStore,
    allRecords: TransactionRecord[],
  ) {
    this.allRecords = allRecords;
  }

  /**
   * The view keeps one bar alive across redraws so the disclosure does not snap
   * shut every time a filter changes, which means the record set it offers
   * options from has to be refreshed rather than passed once at construction.
   */
  setRecords(allRecords: TransactionRecord[]): void {
    this.allRecords = allRecords;
  }

  render(container: HTMLElement): void {
    const filter = this.store.get();
    const bar = container.createDiv({ cls: "fin-filter-bar" });

    // --- search ---
    const searchRow = bar.createDiv({ cls: "fin-search" });
    const searchIcon = searchRow.createSpan({ cls: "fin-search-icon" });
    setIcon(searchIcon, "search");
    const input = searchRow.createEl("input", {
      cls: "fin-search-input",
      attr: { type: "search", placeholder: "Search merchant, SMS, category", value: filter.search },
    });
    // Debounced so a full re-render does not run on every keystroke.
    let timer: number | null = null;
    input.addEventListener("input", () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        this.store.set({ search: input.value });
      }, 200);
    });

    // --- primary chips ---
    const chips = bar.createDiv({ cls: "fin-chip-row" });

    this.multiChip(chips, "Category", filter.categories, distinctCategories(this.allRecords),
      (next) => this.store.set({ categories: next }));

    this.multiChip(chips, "Account", filter.accounts, distinctAccounts(this.allRecords),
      (next) => this.store.set({ accounts: next }));

    const more = chips.createEl("button", { cls: "fin-chip", text: this.expanded ? "Fewer filters" : "More filters" });
    more.addEventListener("click", () => {
      this.expanded = !this.expanded;
      // Redraw only this bar. Expanding is view state, not filter state, so it
      // must not go through the store and trigger a data recompute.
      bar.remove();
      this.render(container);
    });

    if (this.store.activeCount() > 0) {
      const clear = chips.createEl("button", { cls: "fin-chip fin-chip-clear", text: "Clear all" });
      clear.addEventListener("click", () => this.store.clearAll());
    }

    // --- disclosure ---
    if (!this.expanded) return;
    const extra = bar.createDiv({ cls: "fin-chip-row fin-chip-row-wrap" });

    this.multiChip(extra, "Type", filter.types, TYPE_OPTIONS.map((option) => option.value),
      (next) => this.store.set({ types: next as TransactionType[] }),
      (value) => TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value);

    this.multiChip(extra, "Status", filter.statuses, STATUS_OPTIONS.map((option) => option.value),
      (next) => this.store.set({ statuses: next as TransactionStatus[] }),
      (value) => STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value);

    this.singleChip(extra, EXCLUDED_OPTIONS, filter.excluded,
      (value) => this.store.set({ excluded: value }));

    const amounts = bar.createDiv({ cls: "fin-amount-range" });
    this.numberInput(amounts, "Min amount", filter.amountMin, (value) => this.store.set({ amountMin: value }));
    this.numberInput(amounts, "Max amount", filter.amountMax, (value) => this.store.set({ amountMax: value }));

    if (filter.period.unit === "custom") {
      const range = bar.createDiv({ cls: "fin-amount-range" });
      this.dateInput(range, "From", filter.period.from, (value) =>
        this.store.setPeriod({ ...filter.period, from: value }));
      this.dateInput(range, "To", filter.period.to, (value) =>
        this.store.setPeriod({ ...filter.period, to: value }));
    }
  }

  private multiChip(
    container: HTMLElement,
    label: string,
    selected: string[],
    options: string[],
    apply: (next: string[]) => void,
    labelOf: (value: string) => string = (value) => value,
  ): void {
    const text = selected.length === 0
      ? label
      : selected.length === 1
        ? labelOf(selected[0])
        : `${label}: ${selected.length}`;

    const button = container.createEl("button", { cls: "fin-chip", text });
    button.toggleClass("is-active", selected.length > 0);

    button.addEventListener("click", (event) => {
      const menu = new Menu();
      if (!options.length) {
        menu.addItem((item) => item.setTitle("Nothing to filter by").setDisabled(true));
      }
      for (const option of options) {
        menu.addItem((item) =>
          item.setTitle(labelOf(option)).setChecked(selected.includes(option)).onClick(() => {
            apply(selected.includes(option)
              ? selected.filter((item) => item !== option)
              : [...selected, option]);
          }),
        );
      }
      if (selected.length) {
        menu.addSeparator();
        menu.addItem((item) => item.setTitle(`Clear ${label.toLowerCase()}`).onClick(() => apply([])));
      }
      menu.showAtMouseEvent(event);
    });
  }

  private singleChip<T extends string>(
    container: HTMLElement,
    options: Array<{ value: T; label: string }>,
    selected: T,
    apply: (value: T) => void,
  ): void {
    const current = options.find((option) => option.value === selected) ?? options[0];
    const button = container.createEl("button", { cls: "fin-chip", text: current.label });
    button.toggleClass("is-active", selected !== options[0].value);
    button.addEventListener("click", (event) => {
      const menu = new Menu();
      for (const option of options) {
        menu.addItem((item) =>
          item.setTitle(option.label).setChecked(option.value === selected).onClick(() => apply(option.value)),
        );
      }
      menu.showAtMouseEvent(event);
    });
  }

  private numberInput(
    container: HTMLElement,
    placeholder: string,
    value: number | null,
    apply: (value: number | null) => void,
  ): void {
    const input = container.createEl("input", {
      cls: "fin-range-input",
      attr: { type: "number", inputmode: "decimal", placeholder, value: value === null ? "" : String(value) },
    });
    input.addEventListener("change", () => {
      const parsed = Number(input.value);
      apply(input.value.trim() === "" || !Number.isFinite(parsed) ? null : parsed);
    });
  }

  private dateInput(
    container: HTMLElement,
    placeholder: string,
    value: string | null,
    apply: (value: string) => void,
  ): void {
    const input = container.createEl("input", {
      cls: "fin-range-input",
      attr: { type: "date", "aria-label": placeholder, value: value ?? "" },
    });
    input.addEventListener("change", () => apply(input.value));
  }
}
