# Budget UI — Plan B: Transactions App Implementation Plan


**Goal:** A Budget view with a period picker, filter bar, and a day-grouped transaction list you can edit from — plus the exclusion-rules engine wired to an editor — so the plugin becomes a usable budget tracker on iPhone and desktop.

**Architecture:** One `ItemView` with a tab bar. A `FilterStore` holds the current filter and notifies subscribers; the `TransactionIndex` from Plan A notifies on vault changes. Every component is a class with `render(container)` and takes its data as arguments — no component reaches into another. Rendering is full-redraw-on-change of the affected section, not diffing: at 100–200 transactions a month, redrawing a list of a few hundred rows is faster than any reconciliation we would write.

**Tech Stack:** TypeScript, Obsidian `ItemView`/`Modal`/`Menu`/`setIcon`, plain DOM, one hand-written `styles.css`.

**Spec:** `docs/superpowers/specs/2026-09-11-budget-ui-design.md`

**Depends on:** Plan A must be complete. Every import below refers to modules Plan A created.

## Global Constraints

- All paths are relative to `Budget/obsidian-finance-automation/`.
- **No UI framework and no runtime dependencies.** `package.json` gains only `devDependencies`.
- Nothing under `src/domain/` may import from `obsidian` — `tests/architecture.test.ts` enforces this.
- Every write to a transaction note goes through `updateTransaction` / `setExcluded` / `setCategory` from `src/data/write.ts`, which use `processFrontMatter`.
- Every interactive target is at least 44×44 CSS pixels.
- Surfaces and text use Obsidian theme variables (`--background-primary`, `--background-secondary`, `--background-modifier-border`, `--text-normal`, `--text-muted`, `--interactive-accent`). Only category identity and money direction get their own colours.
- Layout responds to the **view width** via container queries, never to a device check, so the same layout works in a narrow desktop sidebar.
- All amounts render with `font-variant-numeric: tabular-nums`.
- Transitions are limited to 150ms `opacity`/`transform` and are disabled under `prefers-reduced-motion`.
- Currency is never converted. When a filtered set spans more than one currency, render one row per currency rather than one combined figure.
- Run `npm run build` after each task and reload Obsidian to check the result by hand. The plan says so explicitly only where the visual result is the deliverable.

---

## File Structure

```
src/store/filter-store.ts        current filter + subscribers + persistence
src/ui/format.ts                 money, date and time formatting
src/ui/colors.ts                 category colour resolution and the fallback palette
src/ui/budget-view.ts            the ItemView: tab bar, shared filter bar, tab hosting
src/ui/tabs/transactions-tab.ts  summary strip + review banner + day-grouped list
src/ui/components/period-picker.ts
src/ui/components/filter-bar.ts
src/ui/components/summary-strip.ts
src/ui/components/transaction-row.ts
src/ui/components/transaction-sheet.ts
src/ui/components/add-transaction-modal.ts
src/ui/components/rules-editor.ts
src/ui/components/empty-state.ts
styles.css                       every style in this plan
```

Modified: `src/main.ts` (register the view, ribbon, commands), `src/settings.ts`.

---

### Task 1: Filter store

**Files:**
- Create: `src/store/filter-store.ts`, `tests/filter-store.test.ts`

**Interfaces:**
- Consumes: `Filter`, `DEFAULT_FILTER`, `Period` from `src/data/types.ts`; `cairoToday`, `stepPeriod` from `src/domain/dates.ts`.
- Produces:
  - `class FilterStore`
    - `constructor(saved: Partial<Filter> | null)`
    - `get(): Filter`
    - `set(patch: Partial<Filter>): void`
    - `setPeriod(period: Period): void`
    - `step(delta: number): void`
    - `toggleCategory(name: string): void`
    - `toggleAccount(name: string): void`
    - `clearAll(): void`
    - `activeCount(): number` — filters set beyond the period
    - `subscribe(listener: (filter: Filter) => void): () => void`
    - `serialize(): Partial<Filter>` — for plugin data, omitting the period

- [x] **Step 1: Write the failing test `tests/filter-store.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { FilterStore } from "../src/store/filter-store.ts";

test("a new store opens on the current month", () => {
  const store = new FilterStore(null, "2026-09-11");
  assert.equal(store.get().period.unit, "month");
  assert.equal(store.get().period.anchor, "2026-09");
});

test("saved filters are restored but the period is not", () => {
  const store = new FilterStore(
    { categories: ["Groceries"], excluded: "show", period: { unit: "year", anchor: "2019", from: null, to: null } },
    "2026-09-11",
  );
  assert.deepEqual(store.get().categories, ["Groceries"]);
  assert.equal(store.get().excluded, "show");
  assert.equal(store.get().period.anchor, "2026-09", "the period must always reopen on the current month");
});

test("set notifies subscribers", () => {
  const store = new FilterStore(null, "2026-09-11");
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  store.set({ search: "carrefour" });
  assert.equal(calls, 1);
  assert.equal(store.get().search, "carrefour");
});

test("unsubscribing stops notifications", () => {
  const store = new FilterStore(null, "2026-09-11");
  let calls = 0;
  const stop = store.subscribe(() => { calls += 1; });
  stop();
  store.set({ search: "x" });
  assert.equal(calls, 0);
});

test("step moves the period", () => {
  const store = new FilterStore(null, "2026-01-15");
  store.step(-1);
  assert.equal(store.get().period.anchor, "2025-12");
});

test("toggleCategory adds then removes", () => {
  const store = new FilterStore(null, "2026-09-11");
  store.toggleCategory("Dining");
  assert.deepEqual(store.get().categories, ["Dining"]);
  store.toggleCategory("Dining");
  assert.deepEqual(store.get().categories, []);
});

test("activeCount ignores the period and the default excluded mode", () => {
  const store = new FilterStore(null, "2026-09-11");
  assert.equal(store.activeCount(), 0);
  store.step(-1);
  assert.equal(store.activeCount(), 0, "changing month is not an active filter");
  store.toggleCategory("Dining");
  store.set({ search: "uber" });
  assert.equal(store.activeCount(), 2);
  store.set({ excluded: "only" });
  assert.equal(store.activeCount(), 3);
});

test("clearAll resets everything except the period", () => {
  const store = new FilterStore(null, "2026-09-11");
  store.step(-2);
  store.toggleCategory("Dining");
  store.set({ search: "uber", amountMin: 50 });
  store.clearAll();
  assert.equal(store.activeCount(), 0);
  assert.equal(store.get().period.anchor, "2026-07", "clearing filters must not jump the period");
});

test("serialize omits the period", () => {
  const store = new FilterStore(null, "2026-09-11");
  store.toggleCategory("Dining");
  assert.equal("period" in store.serialize(), false);
  assert.deepEqual(store.serialize().categories, ["Dining"]);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/filter-store.test.ts`
Expected: FAIL — cannot find module `../src/store/filter-store.ts`.

- [x] **Step 3: Write `src/store/filter-store.ts`**

```ts
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
    this.set({ [key]: next } as Partial<Filter>);
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
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/filter-store.test.ts`
Expected: PASS, 9 tests.

- [x] **Step 5: Commit**

```bash
git add src/store/filter-store.ts tests/filter-store.test.ts
git commit -m "feat: add shared filter store"
```

---

### Task 2: Formatting and colour

Small, but every component depends on it, and a money formatter that rounds wrong would be visible everywhere.

**Files:**
- Create: `src/ui/format.ts`, `src/ui/colors.ts`, `tests/format.test.ts`

**Interfaces:**
- Consumes: `CategoryRecord`, `TransactionRecord`.
- Produces:
  - `formatMoney(amount: number, currency: string): string`
  - `formatAmount(amount: number): string` — no currency, two decimals, grouped
  - `formatSignedMoney(record: TransactionRecord): string`
  - `directionOf(record: TransactionRecord): "in" | "out" | "neutral"`
  - `formatDayHeader(date: string, today: string): string` — "Today", "Yesterday", else "Friday, 5 September"
  - `formatTime(time: string | null): string`
  - `CATEGORY_PALETTE: string[]`
  - `categoryColor(name: string, categories: Map<string, CategoryRecord>): string`
  - `categoryIcon(name: string, categories: Map<string, CategoryRecord>): string`

- [x] **Step 1: Write the failing test `tests/format.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { formatAmount, formatMoney, formatDayHeader, formatTime, directionOf } from "../src/ui/format.ts";
import { categoryColor, CATEGORY_PALETTE } from "../src/ui/colors.ts";
import { buildCategory } from "../src/data/records.ts";
import { makeTransaction } from "./helpers/factory.ts";

test("formatAmount groups thousands and always shows two decimals", () => {
  assert.equal(formatAmount(1420.5), "1,420.50");
  assert.equal(formatAmount(0), "0.00");
  assert.equal(formatAmount(1000000), "1,000,000.00");
});

test("formatAmount renders the magnitude, never a minus sign", () => {
  assert.equal(formatAmount(-420), "420.00");
});

test("formatMoney appends the currency", () => {
  assert.equal(formatMoney(1420.5, "EGP"), "1,420.50 EGP");
});

test("directionOf reads the transaction type", () => {
  assert.equal(directionOf(makeTransaction({ transaction_type: "credit" })), "in");
  assert.equal(directionOf(makeTransaction({ transaction_type: "debit" })), "out");
  assert.equal(directionOf(makeTransaction({ transaction_type: "fee" })), "out");
  assert.equal(directionOf(makeTransaction({ transaction_type: "transfer" })), "neutral");
  assert.equal(directionOf(makeTransaction({ transaction_type: "" })), "neutral");
});

test("formatDayHeader says Today and Yesterday", () => {
  assert.equal(formatDayHeader("2026-09-11", "2026-09-11"), "Today");
  assert.equal(formatDayHeader("2026-09-10", "2026-09-11"), "Yesterday");
});

test("formatDayHeader spells out other days", () => {
  assert.equal(formatDayHeader("2026-09-05", "2026-09-11"), "Saturday, 5 September");
});

test("formatDayHeader labels the undated bucket", () => {
  assert.equal(formatDayHeader("", "2026-09-11"), "No date");
});

test("formatTime tolerates a missing time", () => {
  assert.equal(formatTime("14:35"), "14:35");
  assert.equal(formatTime(null), "");
});

test("categoryColor prefers the note's colour", () => {
  const categories = new Map([
    ["Groceries", buildCategory({ type: "category", name: "Groceries", color: "#3B82F6" }, "x.md")],
  ]);
  assert.equal(categoryColor("Groceries", categories), "#3B82F6");
});

test("categoryColor falls back to a stable palette entry", () => {
  const empty = new Map();
  const first = categoryColor("Dining", empty);
  assert.ok(CATEGORY_PALETTE.includes(first));
  assert.equal(first, categoryColor("Dining", empty), "the same name must always get the same colour");
  assert.notEqual(first, categoryColor("Transport", empty));
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/format.test.ts`
Expected: FAIL — cannot find module `../src/ui/format.ts`.

- [x] **Step 3: Write `src/ui/format.ts`**

```ts
import type { TransactionRecord } from "../data/types.ts";

const AMOUNT_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatAmount(amount: number): string {
  return AMOUNT_FORMAT.format(Math.abs(amount));
}

export function formatMoney(amount: number, currency: string): string {
  return currency ? `${formatAmount(amount)} ${currency}` : formatAmount(amount);
}

export function directionOf(record: TransactionRecord): "in" | "out" | "neutral" {
  if (record.type === "credit") return "in";
  if (record.type === "debit" || record.type === "fee") return "out";
  return "neutral";
}

export function formatSignedMoney(record: TransactionRecord): string {
  const direction = directionOf(record);
  const sign = direction === "out" ? "−" : direction === "in" ? "+" : "";
  return `${sign}${formatAmount(record.amount ?? 0)}`;
}

export function formatDayHeader(date: string, today: string): string {
  if (!date) return "No date";
  if (date === today) return "Today";

  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000)
    .toISOString().slice(0, 10);
  if (date === yesterday) return "Yesterday";

  const instant = new Date(`${date}T00:00:00Z`);
  const weekday = WEEKDAYS[instant.getUTCDay()];
  const month = MONTHS[instant.getUTCMonth()];
  return `${weekday}, ${instant.getUTCDate()} ${month}`;
}

export function formatTime(time: string | null): string {
  return time ?? "";
}
```

- [x] **Step 4: Write `src/ui/colors.ts`**

```ts
import type { CategoryRecord } from "../data/types.ts";

/**
 * Twelve hues chosen to stay distinguishable on both a light and a dark
 * background, and to remain separable for the common forms of colour blindness.
 * Used only where colour carries meaning: category identity.
 */
export const CATEGORY_PALETTE = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899",
  "#14B8A6", "#F97316", "#6366F1", "#84CC16", "#06B6D4", "#A855F7",
];

const DEFAULT_ICONS: Record<string, string> = {
  Groceries: "shopping-cart",
  Dining: "utensils",
  Transport: "car",
  Bills: "receipt",
  Shopping: "shopping-bag",
  Health: "heart-pulse",
  Income: "trending-up",
  Fees: "percent",
  Transfer: "arrow-left-right",
  Uncategorized: "circle-help",
};

function hashOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash;
}

export function categoryColor(name: string, categories: Map<string, CategoryRecord>): string {
  const configured = categories.get(name)?.color;
  if (configured) return configured;
  return CATEGORY_PALETTE[hashOf(name) % CATEGORY_PALETTE.length];
}

export function categoryIcon(name: string, categories: Map<string, CategoryRecord>): string {
  return categories.get(name)?.icon ?? DEFAULT_ICONS[name] ?? "circle-dashed";
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/format.test.ts`
Expected: PASS, 10 tests.

- [x] **Step 6: Commit**

```bash
git add src/ui/format.ts src/ui/colors.ts tests/format.test.ts
git commit -m "feat: add money formatting and category colours"
```

---

### Task 3: The view shell and its stylesheet

The first thing you can look at. It delivers an empty Budget view with a working tab bar, plus the design tokens every later task styles against.

**Files:**
- Create: `src/ui/budget-view.ts`
- Modify: `src/main.ts`, `styles.css`

**Interfaces:**
- Consumes: `FilterStore`, `TransactionIndex`, `ItemView`.
- Produces:
  - `const BUDGET_VIEW_TYPE = "finance-budget-view"`
  - `class BudgetView extends ItemView`
    - `constructor(leaf: WorkspaceLeaf, plugin: FinanceAutomationPlugin)`
    - `activeTab: "transactions" | "accounts" | "stats"`
    - `renderActiveTab(): void` — the single entry point every later tab hooks into
  - `plugin.activateBudgetView(): Promise<void>`
  - `plugin.store: FilterStore`

- [x] **Step 1: Write the design tokens into `styles.css`**

Append to the existing file, keeping the spinner rules already there.

```css
/* ---------- Budget UI tokens ---------- */
.finance-budget {
  --fin-gap: 12px;
  --fin-radius: 12px;
  --fin-row-height: 60px;
  --fin-touch: 44px;
  --fin-money-out: #dc2626;
  --fin-money-in: #059669;
  --fin-money-neutral: var(--text-muted);
  --fin-warn: #d97706;
  --fin-over: #dc2626;
  --fin-surface: var(--background-primary);
  --fin-raised: var(--background-secondary);
  --fin-border: var(--background-modifier-border);

  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--fin-surface);
  color: var(--text-normal);
  container-type: inline-size;
}

.theme-dark .finance-budget {
  --fin-money-out: #f87171;
  --fin-money-in: #34d399;
  --fin-warn: #fbbf24;
  --fin-over: #f87171;
}

.finance-budget .fin-amount {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}

.finance-budget .fin-out { color: var(--fin-money-out); }
.finance-budget .fin-in { color: var(--fin-money-in); }
.finance-budget .fin-neutral { color: var(--fin-money-neutral); }

/* ---------- tab bar ---------- */
.fin-tabs {
  display: flex;
  gap: 4px;
  padding: 8px var(--fin-gap);
  border-bottom: 1px solid var(--fin-border);
  flex: 0 0 auto;
}

.fin-tab {
  flex: 1;
  min-height: var(--fin-touch);
  border: none;
  border-radius: var(--fin-radius);
  background: transparent;
  color: var(--text-muted);
  font-weight: 600;
  cursor: pointer;
  transition: opacity 150ms ease;
}

.fin-tab:hover { opacity: 0.8; }

.fin-tab.is-active {
  background: var(--fin-raised);
  color: var(--text-normal);
}

.fin-tab-body {
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

@media (prefers-reduced-motion: reduce) {
  .finance-budget * { transition: none !important; animation: none !important; }
}
```

- [x] **Step 2: Write `src/ui/budget-view.ts`**

```ts
import { ItemView, WorkspaceLeaf } from "obsidian";
import type FinanceAutomationPlugin from "../main.ts";

export const BUDGET_VIEW_TYPE = "finance-budget-view";

export type BudgetTab = "transactions" | "accounts" | "stats";

const TABS: Array<{ id: BudgetTab; label: string }> = [
  { id: "transactions", label: "Transactions" },
  { id: "accounts", label: "Accounts" },
  { id: "stats", label: "Stats" },
];

export class BudgetView extends ItemView {
  private readonly plugin: FinanceAutomationPlugin;
  private activeTab: BudgetTab = "transactions";
  private bodyEl!: HTMLElement;
  private tabBarEl!: HTMLElement;
  private unsubscribe: Array<() => void> = [];

  constructor(leaf: WorkspaceLeaf, plugin: FinanceAutomationPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return BUDGET_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Budget";
  }

  getIcon(): string {
    return "wallet";
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("finance-budget");

    this.tabBarEl = root.createDiv({ cls: "fin-tabs" });
    this.bodyEl = root.createDiv({ cls: "fin-tab-body" });

    this.renderTabBar();
    this.renderActiveTab();

    // Re-render when the data changes or the filter changes. Both are cheap
    // enough at this scale that a full redraw of the active tab is the
    // simplest correct answer.
    this.unsubscribe.push(this.plugin.index.subscribe(() => this.renderActiveTab()));
    this.unsubscribe.push(this.plugin.store.subscribe(() => {
      void this.plugin.persistFilter();
      this.renderActiveTab();
    }));
  }

  async onClose(): Promise<void> {
    for (const stop of this.unsubscribe) stop();
    this.unsubscribe = [];
  }

  private renderTabBar(): void {
    this.tabBarEl.empty();
    for (const tab of TABS) {
      const button = this.tabBarEl.createEl("button", { cls: "fin-tab", text: tab.label });
      button.toggleClass("is-active", tab.id === this.activeTab);
      button.setAttribute("aria-selected", String(tab.id === this.activeTab));
      button.addEventListener("click", () => {
        if (this.activeTab === tab.id) return;
        this.activeTab = tab.id;
        this.renderTabBar();
        this.renderActiveTab();
      });
    }
  }

  renderActiveTab(): void {
    this.bodyEl.empty();
    if (this.activeTab === "transactions") this.renderTransactions();
    else if (this.activeTab === "accounts") this.renderAccounts();
    else this.renderStats();
  }

  // Filled in by Task 6 (transactions) and Plan C (accounts, stats).
  private renderTransactions(): void {
    this.bodyEl.createEl("p", { text: "Transactions" });
  }

  private renderAccounts(): void {
    this.bodyEl.createEl("p", { text: "Accounts" });
  }

  private renderStats(): void {
    this.bodyEl.createEl("p", { text: "Stats" });
  }
}
```

- [x] **Step 3: Register the view in `src/main.ts`**

In `onload`, before the existing ribbon icon:

```ts
this.store = new FilterStore((await this.loadData())?.filter ?? null);

this.registerView(BUDGET_VIEW_TYPE, (leaf) => new BudgetView(leaf, this));

this.addRibbonIcon("wallet", "Open Budget", () => void this.activateBudgetView());

this.addCommand({
  id: "open-budget-view",
  name: "Open Budget",
  callback: () => void this.activateBudgetView(),
});
```

And add the two methods:

```ts
async activateBudgetView(): Promise<void> {
  const existing = this.app.workspace.getLeavesOfType(BUDGET_VIEW_TYPE);
  if (existing.length) {
    await this.app.workspace.revealLeaf(existing[0]);
    return;
  }
  // getLeaf("tab") on desktop, the main area on mobile — both give a full-width pane.
  const leaf = this.app.workspace.getLeaf("tab");
  await leaf.setViewState({ type: BUDGET_VIEW_TYPE, active: true });
  await this.app.workspace.revealLeaf(leaf);
}

async persistFilter(): Promise<void> {
  const data = (await this.loadData()) ?? {};
  await this.saveData({ ...data, filter: this.store.serialize() });
}
```

The existing settings are stored at the top level of plugin data, so reading and spreading the whole object before saving is what keeps them intact.

- [ ] **Step 4: Build and verify by hand**

Run: `npm run build`, then reload Obsidian.

Check:
1. A wallet icon appears in the ribbon; clicking it opens a "Budget" tab.
2. The three tabs switch, with the active one highlighted.
3. The existing refresh ribbon icon and the SMS commands still work.
4. Switch between a light and a dark theme; the tab bar stays legible in both.
5. On iPhone, the view fills the screen and the tabs are comfortable to hit.

- [x] **Step 5: Commit**

```bash
git add src/ui/budget-view.ts src/main.ts styles.css
git commit -m "feat: add Budget view shell with tabs"
```

---

### Task 4: Period picker

**Files:**
- Create: `src/ui/components/period-picker.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `FilterStore`, `periodLabel`, `cairoToday`, `Menu` from `obsidian`.
- Produces: `class PeriodPicker { constructor(store: FilterStore); render(container: HTMLElement): void }`

- [x] **Step 1: Write `src/ui/components/period-picker.ts`**

```ts
import { Menu, setIcon } from "obsidian";
import { periodLabel, cairoToday } from "../../domain/dates.ts";
import type { FilterStore } from "../../store/filter-store.ts";
import type { PeriodUnit } from "../../data/types.ts";

const QUICK_CHIPS: Array<{ label: string; build: (today: string) => Parameters<FilterStore["setPeriod"]>[0] }> = [
  { label: "This month", build: (today) => ({ unit: "month", anchor: today.slice(0, 7), from: null, to: null }) },
  {
    label: "Last month",
    build: (today) => {
      const [year, month] = today.slice(0, 7).split("-").map(Number);
      const previous = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
      return { unit: "month", anchor: previous, from: null, to: null };
    },
  },
  { label: "This year", build: (today) => ({ unit: "year", anchor: today.slice(0, 4), from: null, to: null }) },
  { label: "All", build: () => ({ unit: "all", anchor: "", from: null, to: null }) },
];

export class PeriodPicker {
  constructor(private readonly store: FilterStore) {}

  render(container: HTMLElement): void {
    const today = cairoToday();
    const period = this.store.get().period;
    const wrapper = container.createDiv({ cls: "fin-period" });

    const stepper = wrapper.createDiv({ cls: "fin-period-stepper" });

    const back = stepper.createEl("button", { cls: "fin-icon-button", attr: { "aria-label": "Previous period" } });
    setIcon(back, "chevron-left");
    back.addEventListener("click", () => this.store.step(-1));

    const label = stepper.createEl("button", { cls: "fin-period-label", text: periodLabel(period) });
    label.addEventListener("click", (event) => this.openUnitMenu(event, today));

    const forward = stepper.createEl("button", { cls: "fin-icon-button", attr: { "aria-label": "Next period" } });
    setIcon(forward, "chevron-right");
    forward.addEventListener("click", () => this.store.step(1));

    // Stepping is meaningless for all-time and a custom range.
    const steppable = period.unit === "month" || period.unit === "year";
    back.toggleClass("is-hidden", !steppable);
    forward.toggleClass("is-hidden", !steppable);

    const chips = wrapper.createDiv({ cls: "fin-chip-row" });
    for (const chip of QUICK_CHIPS) {
      const target = chip.build(today);
      const button = chips.createEl("button", { cls: "fin-chip", text: chip.label });
      const isActive = target.unit === period.unit && target.anchor === period.anchor;
      button.toggleClass("is-active", isActive);
      button.addEventListener("click", () => this.store.setPeriod(target));
    }
  }

  private openUnitMenu(event: MouseEvent, today: string): void {
    const menu = new Menu();
    const current = this.store.get().period;

    const units: Array<{ unit: PeriodUnit; label: string }> = [
      { unit: "month", label: "Month" },
      { unit: "year", label: "Year" },
      { unit: "all", label: "All time" },
    ];

    for (const { unit, label } of units) {
      menu.addItem((item) =>
        item.setTitle(label).setChecked(current.unit === unit).onClick(() => {
          const anchor = unit === "month" ? today.slice(0, 7) : unit === "year" ? today.slice(0, 4) : "";
          this.store.setPeriod({ unit, anchor, from: null, to: null });
        }),
      );
    }

    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle("Custom range…").setChecked(current.unit === "custom").onClick(() => {
        this.store.setPeriod({
          unit: "custom", anchor: "",
          from: current.from ?? `${today.slice(0, 7)}-01`,
          to: current.to ?? today,
        });
      }),
    );

    menu.showAtMouseEvent(event);
  }
}
```

When the unit is `custom`, the filter bar (Task 5) renders two date inputs under the stepper; the picker itself only sets the unit.

- [x] **Step 2: Style it in `styles.css`**

```css
.fin-period { padding: var(--fin-gap); display: flex; flex-direction: column; gap: 8px; }

.fin-period-stepper {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}

.fin-period-label {
  flex: 1; min-height: var(--fin-touch);
  border: none; background: transparent;
  color: var(--text-normal); font-size: 1.15em; font-weight: 700;
  cursor: pointer; border-radius: var(--fin-radius);
}

.fin-period-label:hover { background: var(--fin-raised); }

.fin-icon-button {
  display: grid; place-items: center;
  width: var(--fin-touch); height: var(--fin-touch);
  border: none; border-radius: var(--fin-radius);
  background: transparent; color: var(--text-muted); cursor: pointer;
}

.fin-icon-button:hover { background: var(--fin-raised); color: var(--text-normal); }
.fin-icon-button.is-hidden { visibility: hidden; }

.fin-chip-row {
  display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none;
  padding-bottom: 2px;
}
.fin-chip-row::-webkit-scrollbar { display: none; }

.fin-chip {
  flex: 0 0 auto; min-height: 34px; padding: 0 12px;
  border: 1px solid var(--fin-border); border-radius: 999px;
  background: transparent; color: var(--text-muted);
  font-size: 0.85em; white-space: nowrap; cursor: pointer;
  transition: opacity 150ms ease;
}

.fin-chip.is-active {
  background: var(--interactive-accent);
  border-color: var(--interactive-accent);
  color: var(--text-on-accent);
}
```

The quick chips sit in a horizontally scrolling row so a narrow phone never wraps them onto a second line.

- [x] **Step 3: Wire it into the view**

In `budget-view.ts`, add a header region above `bodyEl` and render the picker into it, re-rendering on every filter change:

```ts
this.headerEl = root.createDiv({ cls: "fin-header" });
// … in renderActiveTab, before rendering the tab:
this.headerEl.empty();
new PeriodPicker(this.plugin.store).render(this.headerEl);
```

Place `headerEl` between the tab bar and the body, and give it `flex: 0 0 auto;` in CSS so it stays pinned while the list scrolls.

- [ ] **Step 4: Build and verify by hand**

Run: `npm run build`, reload Obsidian, open Budget.

Check:
1. The label reads the current month, e.g. "September 2026".
2. `‹` and `›` step months, crossing a year boundary correctly (step back from January).
3. Tapping the label opens a menu; choosing Year changes the label to "2026" and the arrows now step years.
4. Choosing All time hides both arrows.
5. The quick chips scroll horizontally on a narrow view and highlight the matching one.

- [x] **Step 5: Commit**

```bash
git add src/ui/components/period-picker.ts src/ui/budget-view.ts styles.css
git commit -m "feat: add period picker with stepper and quick chips"
```

---

### Task 5: Filter bar

**Files:**
- Create: `src/ui/components/filter-bar.ts`
- Modify: `styles.css`, `src/ui/budget-view.ts`

**Interfaces:**
- Consumes: `FilterStore`, `distinctCategories`, `distinctAccounts`, `Menu`, `setIcon`.
- Produces: `class FilterBar { constructor(store: FilterStore, allRecords: TransactionRecord[]); render(container: HTMLElement): void }`

`allRecords` is the **unfiltered** set, so the category and account menus always offer every option rather than only what survives the current filter.

- [x] **Step 1: Write `src/ui/components/filter-bar.ts`**

```ts
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

  constructor(
    private readonly store: FilterStore,
    private readonly allRecords: TransactionRecord[],
  ) {}

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
```

- [x] **Step 2: Style it in `styles.css`**

```css
.fin-filter-bar { padding: 0 var(--fin-gap) var(--fin-gap); display: flex; flex-direction: column; gap: 8px; }

.fin-search { position: relative; display: flex; align-items: center; }

.fin-search-icon {
  position: absolute; left: 10px; display: grid; place-items: center;
  color: var(--text-muted); pointer-events: none;
}

.fin-search-input {
  width: 100%; min-height: var(--fin-touch); padding: 0 12px 0 36px;
  border: 1px solid var(--fin-border); border-radius: var(--fin-radius);
  background: var(--fin-raised); color: var(--text-normal);
}

.fin-chip-row-wrap { flex-wrap: wrap; overflow: visible; }

.fin-chip-clear { color: var(--fin-money-out); border-color: var(--fin-money-out); }

.fin-amount-range { display: flex; gap: 8px; }

.fin-range-input {
  flex: 1; min-height: var(--fin-touch); padding: 0 10px;
  border: 1px solid var(--fin-border); border-radius: var(--fin-radius);
  background: var(--fin-raised); color: var(--text-normal);
}
```

- [x] **Step 3: Wire it into the view header**

In `renderActiveTab`, after the period picker:

```ts
new FilterBar(this.plugin.store, this.plugin.index.transactions()).render(this.headerEl);
```

- [ ] **Step 4: Build and verify by hand**

Run: `npm run build`, reload, open Budget.

Check:
1. Typing in search does not re-render on every character — it settles after a pause.
2. Category and account chips list every value present in the vault, with checkmarks that toggle.
3. Selecting two categories shows "Category: 2".
4. "More filters" reveals type, status, excluded and the amount range; the label flips to "Fewer filters".
5. "Clear all" appears once a filter is set and resets everything but the month.
6. Choosing "Custom range" from the period menu reveals two date inputs under More filters.

- [x] **Step 5: Commit**

```bash
git add src/ui/components/filter-bar.ts src/ui/budget-view.ts styles.css
git commit -m "feat: add filter bar with search, chips and disclosure"
```

---

### Task 6: Summary strip, review banner and the day-grouped list

The payload of this plan. After this task the view shows real transactions.

**Files:**
- Create: `src/ui/components/summary-strip.ts`, `src/ui/components/transaction-row.ts`, `src/ui/components/empty-state.ts`, `src/ui/tabs/transactions-tab.ts`
- Modify: `src/ui/budget-view.ts`, `styles.css`

**Interfaces:**
- Consumes: `applyFilter`, `countNeedingReview`, `totalsByCurrency`, `groupByDay`, `formatAmount`, `formatSignedMoney`, `directionOf`, `formatDayHeader`, `categoryColor`, `categoryIcon`.
- Produces:
  - `class SummaryStrip { render(container, totals: Map<string, Totals>): void }`
  - `class TransactionRow { constructor(record, categories, handlers); render(container): HTMLElement }`
    - `handlers: { onOpen(record): void; onQuickMenu(record, event): void }`
  - `class TransactionsTab { constructor(plugin: FinanceAutomationPlugin); render(container: HTMLElement): void; resetPaging(): void }`
  - `renderEmptyState(container, icon: string, title: string, body: string): void`

- [x] **Step 1: Write `src/ui/components/empty-state.ts`**

```ts
import { setIcon } from "obsidian";

export function renderEmptyState(
  container: HTMLElement,
  icon: string,
  title: string,
  body: string,
): void {
  const wrapper = container.createDiv({ cls: "fin-empty" });
  const iconEl = wrapper.createDiv({ cls: "fin-empty-icon" });
  setIcon(iconEl, icon);
  wrapper.createEl("h3", { text: title });
  wrapper.createEl("p", { text: body });
}
```

- [x] **Step 2: Write `src/ui/components/summary-strip.ts`**

```ts
import { formatAmount } from "../format.ts";
import type { Totals } from "../../domain/aggregate.ts";

export class SummaryStrip {
  render(container: HTMLElement, totals: Map<string, Totals>): void {
    const wrapper = container.createDiv({ cls: "fin-summary" });

    if (!totals.size) {
      // Render zeroes rather than nothing, so the layout does not jump when
      // the first transaction of a month arrives.
      this.renderRow(wrapper, "", { income: 0, expenses: 0, transfers: 0, net: 0, count: 0 });
      return;
    }

    const currencies = [...totals.keys()].sort();
    for (const currency of currencies) {
      this.renderRow(wrapper, currencies.length > 1 ? currency : "", totals.get(currency)!);
    }
  }

  private renderRow(container: HTMLElement, currencyLabel: string, totals: Totals): void {
    if (currencyLabel) container.createDiv({ cls: "fin-summary-currency", text: currencyLabel });
    const row = container.createDiv({ cls: "fin-summary-row" });
    this.cell(row, "Income", formatAmount(totals.income), "fin-in");
    this.cell(row, "Expenses", formatAmount(totals.expenses), "fin-out");
    this.cell(row, "Net", formatAmount(totals.net), totals.net < 0 ? "fin-out" : "fin-in");
  }

  private cell(row: HTMLElement, label: string, value: string, tone: string): void {
    const cell = row.createDiv({ cls: "fin-summary-cell" });
    cell.createDiv({ cls: "fin-summary-label", text: label });
    cell.createDiv({ cls: `fin-summary-value fin-amount ${tone}`, text: value });
  }
}
```

- [x] **Step 3: Write `src/ui/components/transaction-row.ts`**

```ts
import { setIcon } from "obsidian";
import { categoryColor, categoryIcon } from "../colors.ts";
import { directionOf, formatSignedMoney, formatTime } from "../format.ts";
import type { CategoryRecord, TransactionRecord } from "../../data/types.ts";

export interface RowHandlers {
  onOpen(record: TransactionRecord): void;
  onQuickMenu(record: TransactionRecord, event: MouseEvent): void;
}

export class TransactionRow {
  constructor(
    private readonly record: TransactionRecord,
    private readonly categories: Map<string, CategoryRecord>,
    private readonly handlers: RowHandlers,
  ) {}

  render(container: HTMLElement): HTMLElement {
    const record = this.record;
    const row = container.createDiv({ cls: "fin-row" });
    row.toggleClass("is-excluded", record.excluded);
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");

    // --- category glyph ---
    const color = categoryColor(record.category, this.categories);
    const glyph = row.createDiv({ cls: "fin-row-glyph" });
    glyph.style.setProperty("--fin-cat-color", color);
    setIcon(glyph, categoryIcon(record.category, this.categories));

    // --- text ---
    const text = row.createDiv({ cls: "fin-row-text" });
    const primary = record.merchant || record.category || record.type || "Transaction";
    text.createDiv({ cls: "fin-row-primary", text: primary });

    const secondaryParts = [
      record.fromAccount || record.toAccount,
      formatTime(record.time),
    ].filter(Boolean);
    text.createDiv({ cls: "fin-row-secondary", text: secondaryParts.join(" · ") });

    // --- badges, only when the state is not normal ---
    if (record.status !== "parsed" || record.amount === null) {
      const badge = text.createSpan({ cls: "fin-badge fin-badge-warn", text: "Needs review" });
      badge.setAttribute("title", "The parser could not read every field");
    }
    if (record.excluded) {
      text.createSpan({
        cls: "fin-badge fin-badge-excluded",
        text: record.excludeReason || "Excluded",
      });
    }

    // --- amount ---
    const amount = row.createDiv({ cls: "fin-row-amount" });
    const direction = directionOf(record);
    const value = amount.createDiv({
      cls: `fin-amount fin-${direction}`,
      text: record.amount === null ? "—" : formatSignedMoney(record),
    });
    value.toggleClass("is-struck", record.excluded);
    amount.createDiv({ cls: "fin-row-currency", text: record.currency });

    // --- interaction ---
    row.addEventListener("click", () => this.handlers.onOpen(record));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.handlers.onOpen(record);
      }
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.handlers.onQuickMenu(record, event);
    });

    // Long-press opens the quick menu on touch, where there is no right-click.
    let pressTimer: number | null = null;
    row.addEventListener("touchstart", (event) => {
      pressTimer = window.setTimeout(() => {
        pressTimer = null;
        const touch = event.touches[0];
        this.handlers.onQuickMenu(record, new MouseEvent("contextmenu", {
          clientX: touch.clientX, clientY: touch.clientY,
        }));
      }, 500);
    }, { passive: true });
    const cancelPress = () => {
      if (pressTimer !== null) window.clearTimeout(pressTimer);
      pressTimer = null;
    };
    row.addEventListener("touchend", cancelPress);
    row.addEventListener("touchmove", cancelPress);

    return row;
  }
}
```

- [x] **Step 4: Write `src/ui/tabs/transactions-tab.ts`**

```ts
import { Menu, Notice, setIcon } from "obsidian";
import { applyFilter, countNeedingReview } from "../../domain/filter.ts";
import { groupByDay, totalsByCurrency } from "../../domain/aggregate.ts";
import { cairoToday } from "../../domain/dates.ts";
import { formatAmount, formatDayHeader } from "../format.ts";
import { SummaryStrip } from "../components/summary-strip.ts";
import { TransactionRow } from "../components/transaction-row.ts";
import { renderEmptyState } from "../components/empty-state.ts";
import { setCategory, setExcluded } from "../../data/write.ts";
import type FinanceAutomationPlugin from "../../main.ts";
import type { TransactionRecord } from "../../data/types.ts";

const PAGE_SIZE = 100;

export class TransactionsTab {
  private shown = PAGE_SIZE;

  constructor(private readonly plugin: FinanceAutomationPlugin) {}

  /** Reset paging whenever the filter changes, so a new filter starts at the top. */
  resetPaging(): void {
    this.shown = PAGE_SIZE;
  }

  render(container: HTMLElement): void {
    const today = cairoToday();
    const all = this.plugin.index.transactions();
    const filtered = applyFilter(all, this.plugin.store.get(), today);
    const categories = new Map(this.plugin.index.categories().map((item) => [item.name, item]));

    new SummaryStrip().render(container, totalsByCurrency(filtered));

    const review = countNeedingReview(filtered);
    if (review > 0) this.renderReviewBanner(container, review);

    if (!filtered.length) {
      renderEmptyState(
        container, "receipt",
        all.length ? "Nothing matches these filters" : "No transactions yet",
        all.length
          ? "Try a different month, or clear the filters."
          : "Capture one from the iPhone Shortcut, or add one by hand.",
      );
      this.renderAddButton(container);
      return;
    }

    const list = container.createDiv({ cls: "fin-list" });
    const visible = filtered.slice(0, this.shown);

    for (const group of groupByDay(visible)) {
      const header = list.createDiv({ cls: "fin-day-header" });
      header.createSpan({ cls: "fin-day-label", text: formatDayHeader(group.date, today) });

      const totals = [...group.totals].map(([currency, dayTotals]) =>
        `${formatAmount(dayTotals.expenses)}${group.totals.size > 1 ? ` ${currency}` : ""}`,
      ).join(" · ");
      header.createSpan({ cls: "fin-day-total fin-amount", text: totals });

      for (const record of group.records) {
        new TransactionRow(record, categories, {
          onOpen: (target) => this.plugin.openTransactionSheet(target),
          onQuickMenu: (target, event) => this.openQuickMenu(target, event),
        }).render(list);
      }
    }

    if (filtered.length > this.shown) {
      const more = list.createEl("button", {
        cls: "fin-more",
        text: `Show ${Math.min(PAGE_SIZE, filtered.length - this.shown)} more of ${filtered.length}`,
      });
      more.addEventListener("click", () => {
        this.shown += PAGE_SIZE;
        this.plugin.refreshBudgetView();
      });
    }

    this.renderAddButton(container);
  }

  private renderReviewBanner(container: HTMLElement, count: number): void {
    const banner = container.createDiv({ cls: "fin-banner" });
    const icon = banner.createSpan({ cls: "fin-banner-icon" });
    setIcon(icon, "alert-triangle");
    banner.createSpan({
      text: `${count} transaction${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} review`,
    });
    const action = banner.createEl("button", { cls: "fin-banner-action", text: "Show" });
    action.addEventListener("click", () => {
      this.plugin.store.set({ statuses: ["needs_review", "pending"] });
    });
  }

  private renderAddButton(container: HTMLElement): void {
    const button = container.createEl("button", { cls: "fin-fab", attr: { "aria-label": "Add transaction" } });
    setIcon(button, "plus");
    button.addEventListener("click", () => this.plugin.openAddTransactionModal());
  }

  private openQuickMenu(record: TransactionRecord, event: MouseEvent): void {
    const menu = new Menu();

    menu.addItem((item) =>
      item.setTitle(record.excluded ? "Include in calculations" : "Exclude from calculations")
        .setIcon(record.excluded ? "eye" : "eye-off")
        .onClick(async () => {
          try {
            await setExcluded(
              this.plugin.app, record.path, !record.excluded,
              record.excluded ? "" : "Excluded by hand", "manual",
            );
          } catch (error) {
            new Notice(`Could not update the transaction: ${(error as Error).message}`);
          }
        }),
    );

    menu.addSeparator();

    const names = this.plugin.index.categories().map((item) => item.name).sort();
    for (const name of names.length ? names : ["Uncategorized"]) {
      menu.addItem((item) =>
        item.setTitle(name).setChecked(record.category === name).onClick(async () => {
          try {
            await setCategory(this.plugin.app, record.path, name);
          } catch (error) {
            new Notice(`Could not set the category: ${(error as Error).message}`);
          }
        }),
      );
    }

    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle("Open note").setIcon("file-text").onClick(() => {
        void this.plugin.app.workspace.openLinkText(record.path, "", true);
      }),
    );

    menu.showAtMouseEvent(event);
  }
}
```

Writes are not followed by a manual re-render: `processFrontMatter` triggers `metadataCache.on("changed")`, the index updates that one record, and the view re-renders through its existing subscription.

- [x] **Step 5: Add the plugin hooks `src/main.ts` needs**

```ts
refreshBudgetView(): void {
  for (const leaf of this.app.workspace.getLeavesOfType(BUDGET_VIEW_TYPE)) {
    const view = leaf.view;
    if (view instanceof BudgetView) view.renderActiveTab();
  }
}

openTransactionSheet(record: TransactionRecord): void {
  // Filled in by Task 7.
  void this.app.workspace.openLinkText(record.path, "", false);
}

openAddTransactionModal(): void {
  // Filled in by Task 8.
  new Notice("Coming soon");
}
```

In `BudgetView.renderTransactions`, replace the placeholder with:

```ts
this.transactionsTab.render(this.bodyEl);
```

and construct `this.transactionsTab = new TransactionsTab(this.plugin)` in `onOpen`. In the store subscription, call `this.transactionsTab.resetPaging()` before `renderActiveTab()`.

- [x] **Step 6: Style it in `styles.css`**

```css
/* ---------- summary ---------- */
.fin-summary { padding: 0 var(--fin-gap) var(--fin-gap); }
.fin-summary-currency { font-size: 0.75em; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }

.fin-summary-row {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
  padding: var(--fin-gap); border-radius: var(--fin-radius); background: var(--fin-raised);
}

.fin-summary-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.fin-summary-label { font-size: 0.75em; color: var(--text-muted); }
.fin-summary-value { font-size: 1.05em; font-weight: 700; overflow-wrap: anywhere; }

/* ---------- banner ---------- */
.fin-banner {
  display: flex; align-items: center; gap: 8px;
  margin: 0 var(--fin-gap) var(--fin-gap); padding: 10px 12px;
  border-radius: var(--fin-radius);
  background: color-mix(in srgb, var(--fin-warn) 12%, transparent);
  color: var(--text-normal); font-size: 0.9em;
}
.fin-banner-icon { color: var(--fin-warn); display: grid; place-items: center; }
.fin-banner-action {
  margin-left: auto; min-height: 32px; padding: 0 10px;
  border: none; border-radius: 8px;
  background: var(--fin-warn); color: var(--background-primary);
  font-weight: 600; cursor: pointer;
}

/* ---------- list ---------- */
.fin-list { padding-bottom: 96px; }

.fin-day-header {
  position: sticky; top: 0; z-index: 1;
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  padding: 8px var(--fin-gap);
  background: var(--fin-surface);
  border-bottom: 1px solid var(--fin-border);
  font-size: 0.8em; font-weight: 600; color: var(--text-muted);
}

.fin-row {
  display: flex; align-items: center; gap: 12px;
  min-height: var(--fin-row-height); padding: 8px var(--fin-gap);
  cursor: pointer; transition: opacity 150ms ease;
}
.fin-row:hover { background: var(--fin-raised); }
.fin-row.is-excluded { opacity: 0.55; }

.fin-row-glyph {
  flex: 0 0 auto; display: grid; place-items: center;
  width: 38px; height: 38px; border-radius: 50%;
  color: var(--fin-cat-color);
  background: color-mix(in srgb, var(--fin-cat-color) 15%, transparent);
}

.fin-row-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.fin-row-primary { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fin-row-secondary { font-size: 0.8em; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.fin-badge {
  display: inline-block; margin-top: 2px; padding: 1px 6px;
  border-radius: 6px; font-size: 0.7em; font-weight: 600;
}
.fin-badge-warn { background: color-mix(in srgb, var(--fin-warn) 20%, transparent); color: var(--fin-warn); }
.fin-badge-excluded { background: var(--fin-raised); color: var(--text-muted); }

.fin-row-amount { flex: 0 0 auto; text-align: right; display: flex; flex-direction: column; gap: 2px; }
.fin-row-amount .fin-amount { font-weight: 700; }
.fin-row-amount .is-struck { text-decoration: line-through; }
.fin-row-currency { font-size: 0.7em; color: var(--text-muted); }

.fin-more {
  display: block; width: calc(100% - 2 * var(--fin-gap)); margin: var(--fin-gap);
  min-height: var(--fin-touch); border: 1px solid var(--fin-border);
  border-radius: var(--fin-radius); background: transparent;
  color: var(--text-muted); cursor: pointer;
}

/* ---------- empty state ---------- */
.fin-empty { padding: 48px var(--fin-gap); text-align: center; color: var(--text-muted); }
.fin-empty-icon { display: grid; place-items: center; margin-bottom: 12px; opacity: 0.5; }
.fin-empty h3 { margin: 0 0 4px; color: var(--text-normal); }
.fin-empty p { margin: 0; font-size: 0.9em; }

/* ---------- add button ---------- */
.fin-fab {
  position: absolute; right: 20px; bottom: 20px; z-index: 2;
  display: grid; place-items: center;
  width: 52px; height: 52px; border: none; border-radius: 50%;
  background: var(--interactive-accent); color: var(--text-on-accent);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25); cursor: pointer;
  transition: transform 150ms ease;
}
.fin-fab:hover { transform: scale(1.05); }

.fin-tab-body { position: relative; }

/* ---------- wide layout ---------- */
@container (min-width: 640px) {
  .fin-row { min-height: 52px; }
  .fin-summary-row { padding: 16px; }
}
```

- [ ] **Step 7: Build and verify by hand**

Run: `npm run build`, reload Obsidian.

Create three or four transaction notes with different categories, accounts, and dates — including one dated last month and one with `excluded: true` — then check:

1. The list groups by day, newest first, with a per-day expense total in each header.
2. Day headers stick to the top of the list while scrolling.
3. The summary strip shows income, expenses, and net, and updates when you change month.
4. An excluded row is dimmed with a struck-through amount and an "Excluded" pill, and is absent from the totals — switch the excluded chip to "Show" to see it at all.
5. Category glyphs are coloured and consistent between sessions.
6. Right-click (desktop) or long-press (iPhone) opens the quick menu; setting a category updates the row within a second without a manual refresh.
7. The "Needs review" banner appears when a note is `pending`, and "Show" filters to those.
8. Amounts line up vertically because of tabular figures.

- [x] **Step 8: Commit**

```bash
git add src/ui/components/ src/ui/tabs/ src/ui/budget-view.ts src/main.ts styles.css
git commit -m "feat: add day-grouped transaction list with summary and quick actions"
```

---

### Task 7: Transaction detail sheet

**Files:**
- Create: `src/ui/components/transaction-sheet.ts`
- Modify: `src/main.ts`, `styles.css`

**Interfaces:**
- Consumes: `Modal`, `Setting`, `Notice`; `updateTransaction`, `setExcluded`.
- Produces: `class TransactionSheet extends Modal { constructor(app, plugin, record: TransactionRecord) }`

- [x] **Step 1: Write `src/ui/components/transaction-sheet.ts`**

```ts
import { App, Modal, Notice, Setting } from "obsidian";
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

  onOpen(): void {
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
```

The comment on `exclude_source` is the important behaviour: touching the toggle by hand converts a rule exclusion into a manual one, which `resolveExclusion` then leaves alone forever.

- [x] **Step 2: Wire it up in `src/main.ts`**

```ts
openTransactionSheet(record: TransactionRecord): void {
  new TransactionSheet(this.app, this, record).open();
}
```

- [x] **Step 3: Style it in `styles.css`**

```css
.fin-sheet .setting-item { padding: 8px 0; border: none; }
.fin-sheet .is-hidden { display: none; }
.fin-sheet-note { font-size: 0.85em; color: var(--text-muted); margin: 4px 0 0; }
.fin-sheet-sms pre { white-space: pre-wrap; word-break: break-word; font-size: 0.85em; }
.fin-sheet-meta { display: flex; gap: 12px; font-size: 0.8em; color: var(--text-muted); margin-top: 8px; }
.fin-sheet-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
.fin-sheet-actions button { min-height: var(--fin-touch); padding: 0 16px; }

/* On a phone, present it as a bottom sheet rather than a centred dialog. */
@media (max-width: 640px) {
  .fin-sheet {
    position: fixed; inset: auto 0 0 0;
    max-height: 88vh; width: 100%;
    border-radius: 16px 16px 0 0;
    animation: fin-sheet-up 150ms ease-out;
  }
  @keyframes fin-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
}

@media (prefers-reduced-motion: reduce) {
  .fin-sheet { animation: none; }
}
```

- [ ] **Step 4: Build and verify by hand**

Run: `npm run build`, reload.

Check:
1. Tapping a row opens the sheet with every field populated.
2. Changing the category and saving updates the row immediately.
3. Toggling "Exclude" reveals the reason field; saving dims the row and removes it from the totals.
4. Changing the date moves the transaction to a different day group, and to a different month if you cross one.
5. Entering "abc" as the amount shows a notice and does not save.
6. The Original SMS section expands and wraps long Arabic text without overflowing.
7. On iPhone the sheet rises from the bottom and is scrollable.
8. Open the underlying note and confirm the body below the frontmatter is untouched.

- [x] **Step 5: Commit**

```bash
git add src/ui/components/transaction-sheet.ts src/main.ts styles.css
git commit -m "feat: add transaction detail sheet with editing"
```

---

### Task 8: Add-transaction modal

**Files:**
- Create: `src/ui/components/add-transaction-modal.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `createManualTransaction` from `src/data/create.ts` (Plan A, Task 13).
- Produces: `class AddTransactionModal extends Modal { constructor(app, plugin) }`

- [x] **Step 1: Write `src/ui/components/add-transaction-modal.ts`**

```ts
import { App, Modal, Notice, Setting } from "obsidian";
import { createManualTransaction } from "../../data/create.ts";
import { cairoToday } from "../../domain/dates.ts";
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
    merchant: "",
    note: "",
  };

  constructor(app: App, private readonly plugin: FinanceAutomationPlugin) {
    super(app);
  }

  onOpen(): void {
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
      });
    });

    new Setting(contentEl).setName("Account").addDropdown((dropdown) => {
      const options = accounts.length ? accounts : ["Cash"];
      for (const name of options) dropdown.addOption(name, name);
      dropdown.setValue(this.draft.account || options[0])
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

    new Setting(contentEl).setName("Merchant").addText((text) =>
      text.setPlaceholder("Where did it go?").setValue(this.draft.merchant)
        .onChange((value) => { this.draft.merchant = value; }),
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
        merchant: this.draft.merchant,
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
```

- [x] **Step 2: Wire it up in `src/main.ts`**

```ts
openAddTransactionModal(): void {
  new AddTransactionModal(this.app, this).open();
}
```

Also add a command so it is reachable without the view open:

```ts
this.addCommand({
  id: "add-transaction",
  name: "Add transaction",
  callback: () => this.openAddTransactionModal(),
});
```

- [ ] **Step 3: Build and verify by hand**

Run: `npm run build`, reload.

Check:
1. The floating + button opens the modal with the amount field focused.
2. Choosing "Transfer" reveals the "To account" field; other types hide it.
3. Adding a spending transaction creates a note under `Budget/Transactions/YYYY/Mon/` and it appears in the list immediately.
4. Adding an income transaction puts the account in `to_account`, and the Accounts tab balance rises by that amount (check after Plan C, or read the note's frontmatter now).
5. Saving with an empty amount shows a notice and does not create a note.
6. The note's body contains the text typed into Note, under `## Notes`.

- [x] **Step 4: Commit**

```bash
git add src/ui/components/add-transaction-modal.ts src/main.ts
git commit -m "feat: add manual transaction modal"
```

---

### Task 9: Exclusion rules editor

The engine and its precedence rules already exist and are tested (Plan A, Task 9). This task is the interface for them.

**Files:**
- Create: `src/ui/components/rules-editor.ts`
- Modify: `src/main.ts`, `src/settings.ts`, `styles.css`
- Create: `Budget/Settings/exclusion_rules.json` (in the vault, not the repo)

**Interfaces:**
- Consumes: `loadRules`, `saveRules`; `validateRule`, `matchesRule`, `RULE_FIELDS`, `RULE_OPS`, `ExclusionRule`; `plugin.applyRulesToAll()`.
- Produces:
  - `class RulesEditorModal extends Modal { constructor(app, plugin) }`
  - `class RuleEditModal extends Modal { constructor(app, plugin, rule: ExclusionRule | null, onSave: (rule: ExclusionRule) => Promise<void>) }`

- [x] **Step 1: Seed the rules file**

Create `Budget/Settings/exclusion_rules.json` in the vault with the motivating rule, so there is something real to look at:

```json
{
  "rules": [
    {
      "id": "self-transfer-ahmed",
      "name": "Transfer to my own account",
      "enabled": true,
      "reason": "Transfer between my own accounts",
      "match": "all",
      "conditions": [
        { "field": "sms_message", "op": "contains", "value": "Ahmed Hassan" },
        { "field": "from_account", "op": "equals", "value": "CIB" }
      ]
    }
  ]
}
```

- [x] **Step 2: Write `src/ui/components/rules-editor.ts`**

Two modals. The list modal shows every rule with a live match count; the edit modal builds conditions from dropdowns.

```ts
import { App, Modal, Notice, Setting } from "obsidian";
import { loadRules, saveRules } from "../../data/vault-json.ts";
import { RULE_FIELDS, RULE_OPS, matchesRule, validateRule } from "../../domain/exclusion.ts";
import type { ExclusionRule, RuleCondition, RuleField, RuleOp } from "../../domain/exclusion.ts";
import type FinanceAutomationPlugin from "../../main.ts";

const FIELD_LABELS: Record<RuleField, string> = {
  sms_message: "SMS text",
  merchant: "Merchant",
  from_account: "From account",
  to_account: "To account",
  category: "Category",
  transaction_type: "Type",
  amount: "Amount",
  timestamp: "Timestamp",
};

const OP_LABELS: Record<RuleOp, string> = {
  contains: "contains",
  not_contains: "does not contain",
  equals: "is exactly",
  not_equals: "is not",
  starts_with: "starts with",
  ends_with: "ends with",
  matches: "matches regex",
  gt: "is greater than",
  lt: "is less than",
  between: "is between",
};

export class RulesEditorModal extends Modal {
  private rules: ExclusionRule[] = [];
  private loadError: string | null = null;

  constructor(app: App, private readonly plugin: FinanceAutomationPlugin) {
    super(app);
  }

  async onOpen(): Promise<void> {
    this.modalEl.addClass("fin-sheet");
    const loaded = await loadRules(this.app);
    this.rules = loaded.rules;
    this.loadError = loaded.error;
    this.draw();
  }

  private draw(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Exclusion rules" });
    contentEl.createEl("p", {
      cls: "fin-sheet-note",
      text: "A matching transaction is excluded from every calculation but stays in the list. A transaction you excluded by hand is never touched by a rule.",
    });

    if (this.loadError) {
      const problem = contentEl.createDiv({ cls: "fin-rule-error" });
      problem.createEl("strong", { text: "Some rules could not be read:" });
      problem.createEl("pre", { text: this.loadError });
      problem.createEl("p", { text: "Fix Budget/Settings/exclusion_rules.json, then reopen this window. Saving from here would discard the rules that failed to load." });
      return;
    }

    const records = this.plugin.index.transactions();

    if (!this.rules.length) {
      contentEl.createEl("p", { text: "No rules yet." });
    }

    for (const rule of this.rules) {
      const matches = records.filter((record) => matchesRule(record, { ...rule, enabled: true })).length;
      const setting = new Setting(contentEl)
        .setName(rule.name)
        .setDesc(`${this.describe(rule)} — matches ${matches} transaction${matches === 1 ? "" : "s"}`);

      setting.addToggle((toggle) =>
        toggle.setValue(rule.enabled).onChange(async (value) => {
          rule.enabled = value;
          await this.persist();
        }),
      );

      setting.addButton((button) =>
        button.setIcon("pencil").setTooltip("Edit").onClick(() => {
          new RuleEditModal(this.app, this.plugin, rule, async (updated) => {
            const position = this.rules.findIndex((item) => item.id === rule.id);
            this.rules[position] = updated;
            await this.persist();
            this.draw();
          }).open();
        }),
      );

      setting.addButton((button) =>
        button.setIcon("trash").setTooltip("Delete").setWarning().onClick(async () => {
          this.rules = this.rules.filter((item) => item.id !== rule.id);
          await this.persist();
          this.draw();
        }),
      );
    }

    const actions = contentEl.createDiv({ cls: "fin-sheet-actions" });

    const add = actions.createEl("button", { text: "New rule" });
    add.addEventListener("click", () => {
      new RuleEditModal(this.app, this.plugin, null, async (created) => {
        this.rules.push(created);
        await this.persist();
        this.draw();
      }).open();
    });

    const apply = actions.createEl("button", { cls: "mod-cta", text: "Apply to all transactions" });
    apply.addEventListener("click", async () => {
      const updated = await this.plugin.applyRulesToAll();
      new Notice(`Updated ${updated} transaction${updated === 1 ? "" : "s"}.`);
      this.draw();
    });
  }

  private describe(rule: ExclusionRule): string {
    const joiner = rule.match === "all" ? " and " : " or ";
    return rule.conditions
      .map((condition) => `${FIELD_LABELS[condition.field]} ${OP_LABELS[condition.op]} "${condition.value}"`)
      .join(joiner);
  }

  private async persist(): Promise<void> {
    try {
      await saveRules(this.app, this.rules);
    } catch (error) {
      new Notice(`Could not save the rules: ${(error as Error).message}`);
    }
  }
}

export class RuleEditModal extends Modal {
  private rule: ExclusionRule;

  constructor(
    app: App,
    private readonly plugin: FinanceAutomationPlugin,
    existing: ExclusionRule | null,
    private readonly onSave: (rule: ExclusionRule) => Promise<void>,
  ) {
    super(app);
    this.rule = existing
      ? JSON.parse(JSON.stringify(existing))
      : {
          id: `rule-${Date.now().toString(36)}`,
          name: "",
          enabled: true,
          reason: "",
          match: "all",
          conditions: [{ field: "sms_message", op: "contains", value: "" }],
        };
  }

  onOpen(): void {
    this.modalEl.addClass("fin-sheet");
    this.draw();
  }

  private draw(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.rule.name || "New rule" });

    new Setting(contentEl).setName("Name").addText((text) =>
      text.setPlaceholder("Transfer to my own account").setValue(this.rule.name)
        .onChange((value) => { this.rule.name = value; }),
    );

    new Setting(contentEl).setName("Reason")
      .setDesc("Shown on every transaction this rule excludes.")
      .addText((text) =>
        text.setPlaceholder("Transfer between my own accounts").setValue(this.rule.reason)
          .onChange((value) => { this.rule.reason = value; }),
      );

    new Setting(contentEl).setName("Match").addDropdown((dropdown) => {
      dropdown.addOption("all", "All conditions");
      dropdown.addOption("any", "Any condition");
      dropdown.setValue(this.rule.match).onChange((value) => {
        this.rule.match = value as "all" | "any";
        this.refreshPreview();
      });
    });

    contentEl.createEl("h3", { text: "Conditions" });

    this.rule.conditions.forEach((condition, position) => {
      const row = contentEl.createDiv({ cls: "fin-condition" });

      const field = row.createEl("select", { cls: "fin-condition-part" });
      for (const name of RULE_FIELDS) field.createEl("option", { value: name, text: FIELD_LABELS[name] });
      field.value = condition.field;
      field.addEventListener("change", () => {
        condition.field = field.value as RuleField;
        this.refreshPreview();
      });

      const op = row.createEl("select", { cls: "fin-condition-part" });
      for (const name of RULE_OPS) op.createEl("option", { value: name, text: OP_LABELS[name] });
      op.value = condition.op;
      op.addEventListener("change", () => {
        condition.op = op.value as RuleOp;
        this.draw();
      });

      const value = row.createEl("input", {
        cls: "fin-condition-part",
        attr: { type: "text", placeholder: "value", value: String(condition.value ?? "") },
      });
      value.addEventListener("input", () => {
        condition.value = value.value;
        this.refreshPreview();
      });

      if (condition.op === "between") {
        const second = row.createEl("input", {
          cls: "fin-condition-part",
          attr: { type: "text", placeholder: "and", value: String(condition.value2 ?? "") },
        });
        second.addEventListener("input", () => {
          condition.value2 = second.value;
          this.refreshPreview();
        });
      }

      const remove = row.createEl("button", { cls: "fin-condition-remove", text: "×" });
      remove.setAttribute("aria-label", "Remove condition");
      remove.addEventListener("click", () => {
        this.rule.conditions.splice(position, 1);
        this.draw();
      });
    });

    const add = contentEl.createEl("button", { cls: "fin-more", text: "Add condition" });
    add.addEventListener("click", () => {
      this.rule.conditions.push({ field: "sms_message", op: "contains", value: "" } as RuleCondition);
      this.draw();
    });

    this.previewEl = contentEl.createDiv({ cls: "fin-rule-preview" });
    this.refreshPreview();

    const actions = contentEl.createDiv({ cls: "fin-sheet-actions" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const save = actions.createEl("button", { cls: "mod-cta", text: "Save rule" });
    save.addEventListener("click", () => void this.save());
  }

  private previewEl!: HTMLElement;

  /** Shows what the rule would catch before it is saved. */
  private refreshPreview(): void {
    this.previewEl.empty();
    const errors = validateRule(this.rule);
    if (errors.length) {
      this.previewEl.createEl("p", { cls: "fin-rule-error-text", text: errors[0] });
      return;
    }

    const records = this.plugin.index.transactions();
    const matches = records.filter((record) => matchesRule(record, { ...this.rule, enabled: true }));
    this.previewEl.createEl("p", {
      text: `Matches ${matches.length} of ${records.length} transactions.`,
    });

    const manual = matches.filter((record) => record.excluded && record.excludeSource === "manual").length;
    if (manual) {
      this.previewEl.createEl("p", {
        cls: "fin-sheet-note",
        text: `${manual} of those were excluded by hand and will not be changed.`,
      });
    }

    const list = this.previewEl.createEl("ul", { cls: "fin-rule-preview-list" });
    for (const record of matches.slice(0, 5)) {
      list.createEl("li", {
        text: `${record.date ?? "?"} · ${record.merchant || record.category} · ${record.amount ?? "?"} ${record.currency}`,
      });
    }
  }

  private async save(): Promise<void> {
    const errors = validateRule(this.rule);
    if (errors.length) {
      new Notice(errors.join("\n"));
      return;
    }
    if (!this.rule.reason) this.rule.reason = this.rule.name;
    await this.onSave(this.rule);
    this.close();
  }
}
```

- [x] **Step 3: Add the entry points**

A command in `src/main.ts`:

```ts
this.addCommand({
  id: "edit-exclusion-rules",
  name: "Edit exclusion rules",
  callback: () => new RulesEditorModal(this.app, this).open(),
});
```

And a button in `src/settings.ts`:

```ts
new Setting(containerEl)
  .setName("Exclusion rules")
  .setDesc("Rules that automatically exclude matching transactions from calculations.")
  .addButton((button) =>
    button.setButtonText("Edit rules").onClick(() => {
      new RulesEditorModal(this.app, this.plugin).open();
    }),
  );
```

- [x] **Step 4: Style it in `styles.css`**

```css
.fin-condition { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 8px; }
.fin-condition-part { flex: 1 1 120px; min-width: 0; min-height: var(--fin-touch); }
.fin-condition-remove {
  flex: 0 0 auto; width: var(--fin-touch); height: var(--fin-touch);
  border: none; border-radius: var(--fin-radius);
  background: transparent; color: var(--text-muted);
  font-size: 1.2em; cursor: pointer;
}
.fin-condition-remove:hover { color: var(--fin-money-out); }

.fin-rule-preview {
  margin-top: 12px; padding: 10px 12px;
  border-radius: var(--fin-radius); background: var(--fin-raised); font-size: 0.85em;
}
.fin-rule-preview p { margin: 0 0 4px; }
.fin-rule-preview-list { margin: 4px 0 0; padding-left: 18px; color: var(--text-muted); }
.fin-rule-error { padding: 12px; border-radius: var(--fin-radius); background: color-mix(in srgb, var(--fin-money-out) 12%, transparent); }
.fin-rule-error-text { color: var(--fin-money-out); }
```

- [ ] **Step 5: Build and verify by hand**

Run: `npm run build`, reload.

Check:
1. "Edit exclusion rules" from the command palette lists the seeded rule with a live match count.
2. Editing it shows both conditions in dropdowns, and the preview updates as you type.
3. Typing a condition that matches nothing shows "Matches 0 of N".
4. Entering `([bad` with the "matches regex" operator shows the validation message and refuses to save.
5. "Apply to all transactions" excludes the matching ones; their rows dim with the rule's reason as the pill text.
6. Disabling the rule and applying again un-excludes exactly those, and **leaves any transaction you excluded by hand still excluded**. This is the single most important check in the task.
7. Corrupt `exclusion_rules.json` deliberately (delete a brace) and reopen: the editor reports the problem and refuses to save over it.
8. Open a transaction that a rule excluded, toggle exclude off and on in the sheet, save, then re-apply rules — it stays as you set it, because the sheet made it manual.

- [x] **Step 6: Commit**

```bash
git add src/ui/components/rules-editor.ts src/main.ts src/settings.ts styles.css
git commit -m "feat: add exclusion rules editor with live preview"
```

---

### Task 10: Mobile pass and plan close-out

**Files:**
- Modify: `styles.css`, `README.md`

- [ ] **Step 1: Test every flow on the iPhone**

Build, let `github-gitless-sync` carry the plugin across (or install through BRAT), and restart Obsidian on the phone. Walk through:

1. Open Budget from the ribbon — the view fills the screen.
2. Step months with the arrows; the targets are comfortable, not fiddly.
3. Scroll a long list — day headers stick, scrolling is smooth, the page does not rubber-band the whole app.
4. Long-press a row — the quick menu opens and does not also fire the tap handler.
5. Tap a row — the sheet rises from the bottom and scrolls internally.
6. Tap + — the keyboard opens straight into the amount field.
7. Rotate to landscape — nothing overflows horizontally.
8. Switch to a light theme and back — every surface and every amount stays legible.

- [ ] **Step 2: Fix what the pass found**

Common ones to expect, with the fixes:

```css
/* Stop iOS zooming the page when a text field is focused. */
.finance-budget input, .fin-sheet input, .fin-sheet select, .fin-sheet textarea {
  font-size: 16px;
}

/* Keep the floating button clear of the iPhone home indicator. */
.fin-fab { bottom: calc(20px + env(safe-area-inset-bottom)); }

/* Keep the sheet clear of it too. */
@media (max-width: 640px) {
  .fin-sheet { padding-bottom: env(safe-area-inset-bottom); }
}
```

- [ ] **Step 3: Document the view in `README.md`**

Add under "Obsidian automation":

```markdown
## The Budget view

Open it from the wallet icon in the ribbon, or with **Open Budget** from the command
palette. It has three tabs sharing one set of filters.

- **Transactions** — grouped by day, defaulting to the current month. Step months with
  the arrows, or tap the month name to switch to a year, all time, or a custom range.
  Tap a transaction to edit it; long-press (iPhone) or right-click (desktop) for quick
  category and exclude actions. The + button adds one by hand.
- **Excluding a transaction** keeps it in the list but removes it from every total.
  Use it for a reversal, a duplicate SMS, or anything that did not really happen.
- **Exclusion rules** (command palette: **Edit exclusion rules**) exclude matching
  transactions automatically. A transaction you excluded by hand is never overridden
  by a rule.
```

- [ ] **Step 4: Run the full suite and build**

Run: `npm test && npm run build`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add styles.css README.md
git commit -m "fix: mobile polish for the Budget view"
```

---

## Done when

- Opening Budget shows this month's transactions grouped by day, with a live income/expenses/net strip.
- Category, account, type, status, amount, search, and excluded filters all work and combine.
- The period steps by month and year, and switches to all time or a custom range.
- Tapping a transaction edits it; the note's body is never disturbed.
- Excluding a transaction dims it, strikes the amount, and removes it from every total.
- A rule can be written from the UI, previewed before saving, applied to every transaction, and reverted by disabling it — without ever overriding a manual decision.
- Everything above works on the iPhone.

Plan C adds the Accounts and Stats tabs.
