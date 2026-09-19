import { DEFAULT_FILTER } from "../data/types.ts";
import { cairoToday, stepPeriod } from "../domain/dates.ts";
import type { Filter, Period } from "../data/types.ts";

/**
 * Holds the filter every tab shares. The period is deliberately not persisted:
 * reopening the view should always land on the current month, which is the
 * question being asked 95% of the time.
 */
export class FilterStore {
  private filter: Filter;
  private readonly listeners = new Set<(filter: Filter) => void>();

  constructor(saved: Partial<Filter> | null, today: string = cairoToday()) {
    const { period: _ignored, ...rest } = saved ?? {};
    this.filter = {
      ...DEFAULT_FILTER,
      ...rest,
      period: { unit: "month", anchor: today.slice(0, 7), from: null, to: null },
    };
  }

  get(): Filter {
    return this.filter;
  }

  set(patch: Partial<Filter>): void {
    this.filter = { ...this.filter, ...patch };
    for (const listener of this.listeners) listener(this.filter);
  }

  setPeriod(period: Period): void {
    this.set({ period });
  }

  step(delta: number): void {
    this.set({ period: stepPeriod(this.filter.period, delta) });
  }

  private toggle(key: "categories" | "accounts", name: string): void {
    const current = this.filter[key];
    const next = current.includes(name)
      ? current.filter((item) => item !== name)
      : [...current, name];
    this.set({ [key]: next });
  }

  toggleCategory(name: string): void {
    this.toggle("categories", name);
  }

  toggleAccount(name: string): void {
    this.toggle("accounts", name);
  }

  clearAll(): void {
    this.set({
      categories: [], accounts: [], types: [], statuses: [],
      search: "", amountMin: null, amountMax: null, excluded: DEFAULT_FILTER.excluded,
    });
  }

  activeCount(): number {
    const filter = this.filter;
    let count = 0;
    if (filter.categories.length) count += 1;
    if (filter.accounts.length) count += 1;
    if (filter.types.length) count += 1;
    if (filter.statuses.length) count += 1;
    if (filter.search.trim()) count += 1;
    if (filter.amountMin !== null || filter.amountMax !== null) count += 1;
    if (filter.excluded !== DEFAULT_FILTER.excluded) count += 1;
    return count;
  }

  subscribe(listener: (filter: Filter) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  serialize(): Partial<Filter> {
    const { period: _period, ...rest } = this.filter;
    return rest;
  }
}
