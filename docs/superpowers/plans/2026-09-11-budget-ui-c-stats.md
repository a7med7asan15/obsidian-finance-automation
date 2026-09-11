# Budget UI — Plan C: Accounts, Stats and Release Implementation Plan

**Goal:** Complete the Budget view with an Accounts tab showing derived balances, a Stats tab of six panels drawn as hand-rolled SVG, a category editor, CSV export, and a markdown embed — then remove the obsolete generated reports and release.

**Architecture:** Charts are built on three shared SVG primitives (`donut`, `bars`, `hbars`) that take plain data and a colour function and return an `SVGElement`. They read theme colours through CSS custom properties rather than hard-coded values, so a theme change needs no redraw logic. Every panel is a small class with `render(container, data)`; the Stats tab only assembles them.

**Tech Stack:** TypeScript, inline SVG built with `document.createElementNS`, Obsidian `Modal`/`Setting`, plain DOM.

**Spec:** `docs/superpowers/specs/2026-09-11-budget-ui-design.md`

**Depends on:** Plans A and B complete.

## Global Constraints

- All paths are relative to `Budget/obsidian-finance-automation/`.
- **No chart library and no runtime dependencies.** Every chart is hand-written SVG.
- Nothing under `src/domain/` may import from `obsidian`.
- Currency is never converted. A panel showing a single figure renders one row per currency when the filtered set spans more than one; charts render the primary currency and label it.
- Charts must be legible in both themes: stroke and text colours come from `currentColor` or a CSS variable, never a literal hex except for the category palette.
- Charts must be accessible: every chart carries a `<title>`, and every panel is followed by the same numbers in text form (a legend or a table). A chart is never the only way to read a value.
- Every interactive target is at least 44×44 CSS pixels.
- Transitions limited to 150ms `opacity`/`transform`, disabled under `prefers-reduced-motion`.

---

## File Structure

```
src/ui/charts/svg.ts               element helpers, scales, a11y title
src/ui/charts/donut.ts             donut with a centre total
src/ui/charts/bars.ts              vertical bars over time
src/ui/charts/hbars.ts             horizontal ranked bars
src/ui/tabs/accounts-tab.ts        balance cards, net worth, unknown accounts
src/ui/tabs/stats-tab.ts           the six panels
src/ui/components/panel.ts         shared card chrome for a stats panel
src/ui/components/category-editor.ts  colour, icon, monthly budget
src/ui/export-csv.ts               CSV of the current filter
src/codeblock.ts                   ```finance-summary``` embed
```

Modified: `src/main.ts`, `src/ui/budget-view.ts`, `styles.css`, `README.md`, `manifest.json`, `versions.json`, `Budget/Templates/Account.md`.

Deleted: `Budget/Stats/Summary.md`, `Budget/Stats/Needs Review.md`, `Budget/Stats/transactions.csv`.

---

### Task 1: SVG primitives

**Files:**
- Create: `src/ui/charts/svg.ts`, `tests/charts.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K]`
  - `createChart(width: number, height: number, title: string): SVGSVGElement`
  - `linearScale(domainMax: number, rangeMax: number): (value: number) => number`
  - `niceMax(value: number): number` — rounds an axis maximum up to a readable number
  - `arcPath(cx, cy, radius, innerRadius, startAngle, endAngle): string`

`niceMax` and `arcPath` are pure and worth testing; the DOM helpers are not.

- [x] **Step 1: Write the failing test `tests/charts.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { niceMax, linearScale, arcPath } from "../src/ui/charts/svg.ts";

test("niceMax rounds up to a readable axis maximum", () => {
  assert.equal(niceMax(0), 1);
  assert.equal(niceMax(7), 10);
  assert.equal(niceMax(12), 20);
  assert.equal(niceMax(23), 25);
  assert.equal(niceMax(180), 200);
  assert.equal(niceMax(1420.5), 2000);
  assert.equal(niceMax(9999), 10000);
});

test("niceMax never returns less than the value", () => {
  for (const value of [1, 3, 17, 99, 101, 4999, 123456]) {
    assert.ok(niceMax(value) >= value, `niceMax(${value}) = ${niceMax(value)}`);
  }
});

test("linearScale maps the domain onto the range", () => {
  const scale = linearScale(100, 200);
  assert.equal(scale(0), 0);
  assert.equal(scale(50), 100);
  assert.equal(scale(100), 200);
});

test("linearScale survives a zero domain", () => {
  assert.equal(linearScale(0, 200)(0), 0);
});

test("arcPath produces a closed donut segment", () => {
  const path = arcPath(50, 50, 40, 25, 0, Math.PI / 2);
  assert.match(path, /^M /);
  assert.match(path, /A 40 40/);
  assert.match(path, /A 25 25/);
  assert.match(path, /Z$/);
});

test("a full-circle arc does not collapse to a point", () => {
  const path = arcPath(50, 50, 40, 25, 0, Math.PI * 2);
  assert.ok(path.length > 20);
  assert.match(path, /Z$/);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/charts.test.ts`
Expected: FAIL — cannot find module `../src/ui/charts/svg.ts`.

- [x] **Step 3: Write `src/ui/charts/svg.ts`**

```ts
const SVG_NS = "http://www.w3.org/2000/svg";

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    element.setAttribute(name, String(value));
  }
  return element;
}

/**
 * A chart is always given a <title> so a screen reader announces something
 * meaningful, and viewBox rather than fixed width so it scales to the card.
 */
export function createChart(width: number, height: number, title: string): SVGSVGElement {
  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": title,
    preserveAspectRatio: "xMidYMid meet",
  });
  svg.appendChild(svgEl("title")).textContent = title;
  return svg;
}

export function linearScale(domainMax: number, rangeMax: number): (value: number) => number {
  if (domainMax <= 0) return () => 0;
  return (value: number) => (value / domainMax) * rangeMax;
}

/** Rounds an axis maximum up to 1, 2, 2.5 or 5 times a power of ten. */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function pointOnCircle(cx: number, cy: number, radius: number, angle: number): [number, number] {
  // Angles start at 12 o'clock and run clockwise, which is how people read a pie.
  return [cx + radius * Math.sin(angle), cy - radius * Math.cos(angle)];
}

export function arcPath(
  cx: number, cy: number,
  radius: number, innerRadius: number,
  startAngle: number, endAngle: number,
): string {
  // A full circle drawn as one arc collapses, because the start and end points
  // coincide. Nudging the end keeps the segment visible.
  const sweep = Math.min(endAngle - startAngle, Math.PI * 2 - 0.0001);
  const end = startAngle + sweep;
  const largeArc = sweep > Math.PI ? 1 : 0;

  const [outerStartX, outerStartY] = pointOnCircle(cx, cy, radius, startAngle);
  const [outerEndX, outerEndY] = pointOnCircle(cx, cy, radius, end);
  const [innerEndX, innerEndY] = pointOnCircle(cx, cy, innerRadius, end);
  const [innerStartX, innerStartY] = pointOnCircle(cx, cy, innerRadius, startAngle);

  return [
    `M ${outerStartX.toFixed(2)} ${outerStartY.toFixed(2)}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${outerEndX.toFixed(2)} ${outerEndY.toFixed(2)}`,
    `L ${innerEndX.toFixed(2)} ${innerEndY.toFixed(2)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStartX.toFixed(2)} ${innerStartY.toFixed(2)}`,
    "Z",
  ].join(" ");
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/charts.test.ts`
Expected: PASS, 6 tests.

If `createChart` fails under `node --test` because there is no DOM, that is expected — the test file must only import the pure functions. Do not add a DOM shim.

- [x] **Step 5: Commit**

```bash
git add src/ui/charts/svg.ts tests/charts.test.ts
git commit -m "feat: add SVG chart primitives"
```

---

### Task 2: Donut and bar charts

**Files:**
- Create: `src/ui/charts/donut.ts`, `src/ui/charts/bars.ts`, `src/ui/charts/hbars.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `svgEl`, `createChart`, `arcPath`, `linearScale`, `niceMax`, `formatAmount`.
- Produces:
  - `renderDonut(container, data: Array<{ label: string; value: number; color: string }>, options: { total: number; currency: string; onSelect?: (label: string) => void }): void`
  - `renderBars(container, data: Array<{ label: string; value: number; sublabel?: string }>, options: { currency: string; highlightLast?: boolean }): void`
  - `renderHBars(container, data: Array<{ label: string; value: number; color?: string; caption?: string; ratio?: number }>, options: { currency: string; onSelect?: (label: string) => void }): void`

- [x] **Step 1: Write `src/ui/charts/donut.ts`**

```ts
import { arcPath, createChart, svgEl } from "./svg.ts";
import { formatAmount } from "../format.ts";

export interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

export function renderDonut(
  container: HTMLElement,
  data: DonutDatum[],
  options: { total: number; currency: string; onSelect?: (label: string) => void },
): void {
  const positive = data.filter((item) => item.value > 0);
  if (!positive.length) {
    container.createEl("p", { cls: "fin-panel-empty", text: "Nothing to show for this period." });
    return;
  }

  const size = 200;
  const centre = size / 2;
  const radius = 88;
  const inner = 58;
  const total = positive.reduce((sum, item) => sum + item.value, 0);

  const svg = createChart(size, size, `Spending by category, total ${formatAmount(options.total)} ${options.currency}`);
  svg.addClass("fin-donut");

  let angle = 0;
  for (const item of positive) {
    const sweep = (item.value / total) * Math.PI * 2;
    const path = svgEl("path", {
      d: arcPath(centre, centre, radius, inner, angle, angle + sweep),
      fill: item.color,
    });
    path.addClass("fin-donut-slice");

    const share = ((item.value / total) * 100).toFixed(1);
    svg.appendChild(path).appendChild(svgEl("title")).textContent =
      `${item.label}: ${formatAmount(item.value)} ${options.currency} (${share}%)`;

    if (options.onSelect) {
      path.addClass("is-clickable");
      path.addEventListener("click", () => options.onSelect!(item.label));
    }
    angle += sweep;
  }

  const centreValue = svgEl("text", {
    x: centre, y: centre - 2, "text-anchor": "middle", "dominant-baseline": "middle",
  });
  centreValue.addClass("fin-donut-total");
  centreValue.textContent = formatAmount(options.total);
  svg.appendChild(centreValue);

  const centreLabel = svgEl("text", {
    x: centre, y: centre + 18, "text-anchor": "middle", "dominant-baseline": "middle",
  });
  centreLabel.addClass("fin-donut-currency");
  centreLabel.textContent = options.currency;
  svg.appendChild(centreLabel);

  container.appendChild(svg);

  // The legend is not decoration: it is the text alternative that makes every
  // value readable without relying on colour or on hovering a slice.
  const legend = container.createEl("ul", { cls: "fin-legend" });
  for (const item of positive) {
    const row = legend.createEl("li", { cls: "fin-legend-row" });
    const swatch = row.createSpan({ cls: "fin-legend-swatch" });
    swatch.style.background = item.color;
    row.createSpan({ cls: "fin-legend-label", text: item.label });
    row.createSpan({
      cls: "fin-legend-value fin-amount",
      text: `${formatAmount(item.value)} · ${((item.value / total) * 100).toFixed(0)}%`,
    });
    if (options.onSelect) {
      row.addClass("is-clickable");
      row.addEventListener("click", () => options.onSelect!(item.label));
    }
  }
}
```

- [x] **Step 2: Write `src/ui/charts/bars.ts`**

```ts
import { createChart, linearScale, niceMax, svgEl } from "./svg.ts";
import { formatAmount } from "../format.ts";

export interface BarDatum {
  label: string;
  value: number;
  sublabel?: string;
}

export function renderBars(
  container: HTMLElement,
  data: BarDatum[],
  options: { currency: string; highlightLast?: boolean },
): void {
  if (!data.length) {
    container.createEl("p", { cls: "fin-panel-empty", text: "Nothing to show for this period." });
    return;
  }

  const width = 320;
  const height = 140;
  const padBottom = 20;
  const plotHeight = height - padBottom;
  const max = niceMax(Math.max(...data.map((item) => item.value)));
  const scale = linearScale(max, plotHeight - 4);
  const slot = width / data.length;
  const barWidth = Math.max(2, Math.min(slot - 2, 22));

  const svg = createChart(width, height, `Spending over time, peak ${formatAmount(max)} ${options.currency}`);
  svg.addClass("fin-bars");

  const baseline = svgEl("line", { x1: 0, y1: plotHeight, x2: width, y2: plotHeight });
  baseline.addClass("fin-axis");
  svg.appendChild(baseline);

  data.forEach((item, index) => {
    const barHeight = scale(item.value);
    const x = index * slot + (slot - barWidth) / 2;
    const bar = svgEl("rect", {
      x: x.toFixed(2), y: (plotHeight - barHeight).toFixed(2),
      width: barWidth, height: Math.max(barHeight, item.value > 0 ? 1 : 0).toFixed(2),
      rx: 2,
    });
    bar.addClass("fin-bar");
    if (options.highlightLast && index === data.length - 1) bar.addClass("is-current");
    svg.appendChild(bar).appendChild(svgEl("title")).textContent =
      `${item.sublabel ?? item.label}: ${formatAmount(item.value)} ${options.currency}`;
  });

  // Label only the first, middle and last slot, so a 31-day month stays readable.
  for (const index of new Set([0, Math.floor(data.length / 2), data.length - 1])) {
    const label = svgEl("text", {
      x: (index * slot + slot / 2).toFixed(2), y: height - 6, "text-anchor": "middle",
    });
    label.addClass("fin-axis-label");
    label.textContent = data[index].label;
    svg.appendChild(label);
  }

  container.appendChild(svg);
  container.createEl("p", {
    cls: "fin-chart-caption",
    text: `Peak ${formatAmount(max)} ${options.currency} · ${data.length} buckets`,
  });
}
```

- [x] **Step 3: Write `src/ui/charts/hbars.ts`**

Used by both Top merchants and Budget progress, which is why `color` and `caption` are optional per row.

```ts
import { formatAmount } from "../format.ts";

export interface HBarDatum {
  label: string;
  value: number;
  color?: string;
  caption?: string;
  /** 0–1+ when the bar should be measured against something other than the max. */
  ratio?: number;
}

/**
 * Rendered as divs rather than SVG: a ranked list of bars is a layout problem,
 * and HTML wraps long labels and stays selectable, which SVG text does not.
 */
export function renderHBars(
  container: HTMLElement,
  data: HBarDatum[],
  options: { currency: string; onSelect?: (label: string) => void },
): void {
  if (!data.length) {
    container.createEl("p", { cls: "fin-panel-empty", text: "Nothing to show for this period." });
    return;
  }

  const max = Math.max(...data.map((item) => item.value)) || 1;
  const list = container.createDiv({ cls: "fin-hbars" });

  for (const item of data) {
    const row = list.createDiv({ cls: "fin-hbar-row" });

    const head = row.createDiv({ cls: "fin-hbar-head" });
    head.createSpan({ cls: "fin-hbar-label", text: item.label });
    head.createSpan({
      cls: "fin-hbar-value fin-amount",
      text: `${formatAmount(item.value)}${options.currency ? ` ${options.currency}` : ""}`,
    });

    const track = row.createDiv({ cls: "fin-hbar-track" });
    const fill = track.createDiv({ cls: "fin-hbar-fill" });
    const ratio = item.ratio ?? item.value / max;
    fill.style.width = `${Math.min(Math.max(ratio, 0), 1) * 100}%`;
    if (item.color) fill.style.background = item.color;

    if (item.ratio !== undefined && item.ratio > 1) {
      // Over budget: show the overflow as a separate marker rather than a bar
      // longer than its track, which would read as a rendering bug.
      track.addClass("is-over");
    }

    if (item.caption) row.createDiv({ cls: "fin-hbar-caption", text: item.caption });

    if (options.onSelect) {
      row.addClass("is-clickable");
      row.addEventListener("click", () => options.onSelect!(item.label));
    }
  }
}
```

- [x] **Step 4: Style the charts in `styles.css`**

```css
.fin-donut { width: 100%; max-width: 220px; margin: 0 auto; display: block; }
.fin-donut-slice { transition: opacity 150ms ease; }
.fin-donut-slice.is-clickable { cursor: pointer; }
.fin-donut-slice.is-clickable:hover { opacity: 0.75; }
.fin-donut-total { fill: var(--text-normal); font-size: 18px; font-weight: 700; }
.fin-donut-currency { fill: var(--text-muted); font-size: 11px; }

.fin-bars { width: 100%; display: block; }
.fin-axis { stroke: var(--fin-border); stroke-width: 1; }
.fin-axis-label { fill: var(--text-muted); font-size: 10px; }
.fin-bar { fill: var(--interactive-accent); opacity: 0.75; }
.fin-bar.is-current { opacity: 1; }
.fin-chart-caption { font-size: 0.75em; color: var(--text-muted); text-align: center; margin: 4px 0 0; }

.fin-legend { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.fin-legend-row { display: flex; align-items: center; gap: 8px; font-size: 0.85em; }
.fin-legend-row.is-clickable { cursor: pointer; }
.fin-legend-row.is-clickable:hover { opacity: 0.75; }
.fin-legend-swatch { flex: 0 0 auto; width: 10px; height: 10px; border-radius: 3px; }
.fin-legend-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fin-legend-value { flex: 0 0 auto; color: var(--text-muted); }

.fin-hbars { display: flex; flex-direction: column; gap: 12px; }
.fin-hbar-head { display: flex; justify-content: space-between; gap: 8px; font-size: 0.85em; margin-bottom: 4px; }
.fin-hbar-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fin-hbar-value { flex: 0 0 auto; font-weight: 600; }
.fin-hbar-track { height: 8px; border-radius: 4px; background: var(--fin-border); overflow: hidden; }
.fin-hbar-track.is-over { box-shadow: inset 0 0 0 1px var(--fin-over); }
.fin-hbar-fill { height: 100%; background: var(--interactive-accent); border-radius: 4px; transition: width 150ms ease; }
.fin-hbar-caption { font-size: 0.75em; color: var(--text-muted); margin-top: 3px; }
.fin-hbar-row.is-clickable { cursor: pointer; }

.fin-panel-empty { color: var(--text-muted); font-size: 0.9em; text-align: center; padding: 16px 0; margin: 0; }
```

- [x] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exits 0. Nothing renders yet — Task 4 wires the charts in.

- [x] **Step 6: Commit**

```bash
git add src/ui/charts/ styles.css
git commit -m "feat: add donut, bar and ranked-bar charts"
```

---

### Task 3: Accounts tab

**Files:**
- Create: `src/ui/tabs/accounts-tab.ts`
- Modify: `src/ui/budget-view.ts`, `Budget/Templates/Account.md` (in the vault), `styles.css`

**Interfaces:**
- Consumes: `deriveBalances`, `netWorthByCurrency`, `unknownAccountNames`, `applyFilter`, `formatAmount`.
- Produces: `class AccountsTab { constructor(plugin); render(container: HTMLElement): void }`

- [x] **Step 1: Add the opening-balance fields to the account template**

Edit `Budget/Templates/Account.md` in the vault, adding two fields and a comment:

```yaml
---
type: account
currency: EGP
name: ""
card_ending: ""
opening_balance: 0
opening_date: "{{date:YYYY-MM-DD}}"
balance: 0
balance_updated_at: "{{date:YYYY-MM-DD}}T{{time:HH:mm:ss}}"
account_type: bank
institution: ""
active: true
include_in_net_worth: true
tags:
  - finance/account
---

# Account

`opening_balance` is the balance on `opening_date`. The Budget view derives the
current balance from it plus every transaction since. `balance` is optional — set it
from a statement and the Accounts tab will show how far the derived figure has drifted.

## Notes
```

Also create the two real account notes at `Budget/Accounts/CIB.md` and `Budget/Accounts/Cash.md` from this template, and update `Budget/Settings/accounts.json`:

```json
{
  "accounts": [
    { "name": "CIB",  "currency": "EGP", "card_endings": ["0774"], "aliases": ["cib"] },
    { "name": "Cash", "currency": "EGP", "card_endings": [],       "aliases": ["cash"] }
  ]
}
```

- [x] **Step 2: Write `src/ui/tabs/accounts-tab.ts`**

```ts
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
```

- [x] **Step 3: Add `showTransactionsTab` to the plugin and view**

In `BudgetView`, expose:

```ts
showTab(tab: BudgetTab): void {
  this.activeTab = tab;
  this.renderTabBar();
  this.renderActiveTab();
}
```

And in `main.ts`:

```ts
showTransactionsTab(): void {
  for (const leaf of this.app.workspace.getLeavesOfType(BUDGET_VIEW_TYPE)) {
    const view = leaf.view;
    if (view instanceof BudgetView) view.showTab("transactions");
  }
}
```

Replace `BudgetView.renderAccounts` with `this.accountsTab.render(this.bodyEl)`.

- [x] **Step 4: Style it in `styles.css`**

```css
.fin-networth { padding: var(--fin-gap); text-align: center; }
.fin-networth-label { font-size: 0.75em; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.fin-networth-row { display: flex; align-items: baseline; justify-content: center; gap: 6px; }
.fin-networth-value { font-size: 1.9em; font-weight: 700; }
.fin-networth-currency { color: var(--text-muted); font-size: 0.9em; }

.fin-account-list { display: flex; flex-direction: column; gap: 10px; padding: 0 var(--fin-gap) var(--fin-gap); }

.fin-account-card {
  padding: 14px; border-radius: var(--fin-radius);
  background: var(--fin-raised); cursor: pointer;
  transition: transform 150ms ease;
}
.fin-account-card:hover { transform: translateY(-1px); }

.fin-account-head { display: flex; align-items: center; gap: 12px; }
.fin-account-icon {
  flex: 0 0 auto; display: grid; place-items: center;
  width: 38px; height: 38px; border-radius: 10px;
  background: var(--background-primary); color: var(--text-muted);
}
.fin-account-names { flex: 1 1 auto; min-width: 0; }
.fin-account-name { font-weight: 600; }
.fin-account-type { font-size: 0.75em; color: var(--text-muted); text-transform: capitalize; }
.fin-account-amount { flex: 0 0 auto; text-align: right; }
.fin-account-balance { font-size: 1.1em; font-weight: 700; }
.fin-account-currency { font-size: 0.7em; color: var(--text-muted); }

.fin-account-flow { display: flex; gap: 12px; margin-top: 10px; font-size: 0.8em; }
.fin-account-count { color: var(--text-muted); margin-left: auto; }
.fin-account-drift { margin-top: 6px; font-size: 0.75em; color: var(--fin-warn); }

.fin-unknown {
  margin: 0 var(--fin-gap) var(--fin-gap); padding: 12px;
  border-radius: var(--fin-radius);
  background: color-mix(in srgb, var(--fin-warn) 10%, transparent);
  font-size: 0.85em;
}
.fin-unknown p { margin: 4px 0 0; }
```

- [ ] **Step 5: Build and verify by hand**

Run: `npm run build`, reload.

Check:
1. Both accounts appear with a derived balance equal to `opening_balance` plus every transaction since `opening_date`. Verify one by hand against the notes.
2. A transfer between the two moves both balances in opposite directions by the same amount.
3. Excluding a transaction changes the balance immediately.
4. Net worth sums the accounts and respects `include_in_net_worth: false`.
5. Setting `balance:` to a different figure shows the drift line; matching it hides the line.
6. Tapping an account filters the Transactions tab to it and switches tabs.
7. A transaction with `from_account: "Card ••••9999"` shows up under "accounts that are not set up".

- [x] **Step 6: Commit**

```bash
git add src/ui/tabs/accounts-tab.ts src/ui/budget-view.ts src/main.ts styles.css
git commit -m "feat: add accounts tab with derived balances"
```

---

### Task 4: Stats tab

**Files:**
- Create: `src/ui/components/panel.ts`, `src/ui/tabs/stats-tab.ts`
- Modify: `src/ui/budget-view.ts`, `styles.css`

**Interfaces:**
- Consumes: every chart from Task 2; `applyFilter`, `totalsByCurrency`, `spendByCategory`, `spendByMerchant`, `spendByDay`, `spendByMonth`, `primaryCurrency`, `budgetProgress`, `deriveBalances`, `netWorthByCurrency`, `resolvePeriod`, `categoryColor`.
- Produces:
  - `function renderPanel(container: HTMLElement, title: string, subtitle?: string): HTMLElement` — returns the panel body
  - `class StatsTab { constructor(plugin); render(container: HTMLElement): void }`

The six panels, in order: income vs expenses vs net; spending by category; spending over time; budget progress; top merchants; account balances.

- [x] **Step 1: Write `src/ui/components/panel.ts`**

```ts
export function renderPanel(
  container: HTMLElement,
  title: string,
  subtitle?: string,
): HTMLElement {
  const panel = container.createDiv({ cls: "fin-panel" });
  const head = panel.createDiv({ cls: "fin-panel-head" });
  head.createEl("h3", { cls: "fin-panel-title", text: title });
  if (subtitle) head.createSpan({ cls: "fin-panel-subtitle", text: subtitle });
  return panel.createDiv({ cls: "fin-panel-body" });
}
```

- [x] **Step 2: Write `src/ui/tabs/stats-tab.ts`**

```ts
import { applyFilter } from "../../domain/filter.ts";
import {
  primaryCurrency, spendByCategory, spendByDay, spendByMerchant, spendByMonth, totalsByCurrency,
} from "../../domain/aggregate.ts";
import { budgetProgress } from "../../domain/budgets.ts";
import { deriveBalances, netWorthByCurrency } from "../../domain/balances.ts";
import { cairoToday, periodLabel, resolvePeriod } from "../../domain/dates.ts";
import { categoryColor } from "../colors.ts";
import { formatAmount } from "../format.ts";
import { renderPanel } from "../components/panel.ts";
import { renderDonut } from "../charts/donut.ts";
import { renderBars } from "../charts/bars.ts";
import { renderHBars } from "../charts/hbars.ts";
import { renderEmptyState } from "../components/empty-state.ts";
import type FinanceAutomationPlugin from "../../main.ts";
import type { TransactionRecord } from "../../data/types.ts";

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export class StatsTab {
  constructor(private readonly plugin: FinanceAutomationPlugin) {}

  render(container: HTMLElement): void {
    const today = cairoToday();
    const filter = this.plugin.store.get();
    const records = applyFilter(this.plugin.index.transactions(), filter, today);

    if (!records.length) {
      renderEmptyState(
        container, "bar-chart-3", "Nothing to chart",
        "No transactions match these filters. Try a different period.",
      );
      return;
    }

    const grid = container.createDiv({ cls: "fin-panel-grid" });
    const currency = primaryCurrency(records);
    const label = periodLabel(filter.period);

    this.renderFlowPanel(grid, records, label);
    this.renderCategoryPanel(grid, records, currency, label);
    this.renderTrendPanel(grid, records, currency, today);
    this.renderBudgetPanel(grid, records, label);
    this.renderMerchantPanel(grid, records, currency);
    this.renderBalancePanel(grid);
  }

  /** 1. Income vs expenses vs net. */
  private renderFlowPanel(grid: HTMLElement, records: TransactionRecord[], label: string): void {
    const body = renderPanel(grid, "Money in and out", label);
    const totals = totalsByCurrency(records);

    for (const [currency, item] of [...totals].sort()) {
      if (totals.size > 1) body.createDiv({ cls: "fin-panel-currency", text: currency });
      renderHBars(body, [
        { label: "Income", value: item.income, color: "var(--fin-money-in)" },
        { label: "Expenses", value: item.expenses, color: "var(--fin-money-out)" },
        ...(item.transfers ? [{ label: "Transfers", value: item.transfers, color: "var(--text-muted)" }] : []),
      ], { currency });

      const net = body.createDiv({ cls: "fin-panel-net" });
      net.createSpan({ text: "Net" });
      net.createSpan({
        cls: `fin-amount ${item.net < 0 ? "fin-out" : "fin-in"}`,
        text: `${item.net < 0 ? "−" : "+"}${formatAmount(item.net)} ${currency}`,
      });
    }
  }

  /** 2. Spending by category, clickable through to the list. */
  private renderCategoryPanel(
    grid: HTMLElement, records: TransactionRecord[], currency: string, label: string,
  ): void {
    const body = renderPanel(grid, "Where it went", `${label} · ${currency}`);
    const categories = new Map(this.plugin.index.categories().map((item) => [item.name, item]));
    const spend = spendByCategory(records, currency);
    const total = spend.reduce((sum, item) => sum + item.amount, 0);

    renderDonut(
      body,
      spend.map((item) => ({
        label: item.category,
        value: item.amount,
        color: categoryColor(item.category, categories),
      })),
      {
        total,
        currency,
        onSelect: (category) => {
          this.plugin.store.set({ categories: [category] });
          this.plugin.showTransactionsTab();
        },
      },
    );
  }

  /** 3. Spending over time — by day within a month, by month otherwise. */
  private renderTrendPanel(
    grid: HTMLElement, records: TransactionRecord[], currency: string, today: string,
  ): void {
    const filter = this.plugin.store.get();
    const range = resolvePeriod(filter.period, today);
    const body = renderPanel(grid, "Spending over time", currency);

    if (filter.period.unit === "month" && range) {
      const days = spendByDay(records, currency, range.from, range.to);
      renderBars(
        body,
        days.map((day) => ({
          label: String(Number(day.date.slice(8))),
          sublabel: day.date,
          value: day.amount,
        })),
        { currency },
      );
      const spent = days.reduce((sum, day) => sum + day.amount, 0);
      const elapsed = days.filter((day) => day.date <= today).length || days.length;
      body.createEl("p", {
        cls: "fin-chart-caption",
        text: `Average ${formatAmount(spent / elapsed)} ${currency} per day so far`,
      });
      return;
    }

    // Year, all time, or a custom range: bucket by month.
    const months = records.map((record) => record.month).filter(Boolean) as string[];
    if (!months.length) {
      body.createEl("p", { cls: "fin-panel-empty", text: "Nothing to show for this period." });
      return;
    }
    const from = months.reduce((min, month) => (month < min ? month : min), months[0]);
    const to = months.reduce((max, month) => (month > max ? month : max), months[0]);

    renderBars(
      body,
      spendByMonth(records, currency, from, to).map((item) => ({
        label: SHORT_MONTHS[Number(item.month.slice(5, 7)) - 1],
        sublabel: item.month,
        value: item.amount,
      })),
      { currency },
    );
  }

  /** 4. Budget progress. */
  private renderBudgetPanel(grid: HTMLElement, records: TransactionRecord[], label: string): void {
    const body = renderPanel(grid, "Budgets", label);
    const categories = this.plugin.index.categories();
    const progress = budgetProgress(categories, records);

    if (!progress.length) {
      body.createEl("p", {
        cls: "fin-panel-empty",
        text: "No budgets set. Open a category from the Stats tab to set one.",
      });
      this.renderCategoryEditorButton(body);
      return;
    }

    renderHBars(
      body,
      progress.map((item) => ({
        label: item.category,
        value: item.spent,
        ratio: item.ratio,
        color: item.level === "over" ? "var(--fin-over)" : item.level === "warn" ? "var(--fin-warn)" : undefined,
        caption: item.remaining >= 0
          ? `${formatAmount(item.remaining)} left of ${formatAmount(item.budget)}`
          : `${formatAmount(-item.remaining)} over ${formatAmount(item.budget)}`,
      })),
      {
        currency: progress[0].currency,
        onSelect: (category) => {
          this.plugin.store.set({ categories: [category] });
          this.plugin.showTransactionsTab();
        },
      },
    );

    this.renderCategoryEditorButton(body);
  }

  private renderCategoryEditorButton(body: HTMLElement): void {
    const button = body.createEl("button", { cls: "fin-more", text: "Edit categories and budgets" });
    button.addEventListener("click", () => this.plugin.openCategoryEditor());
  }

  /** 5. Top merchants. */
  private renderMerchantPanel(
    grid: HTMLElement, records: TransactionRecord[], currency: string,
  ): void {
    const body = renderPanel(grid, "Top merchants", currency);
    const merchants = spendByMerchant(records, currency, 10);
    renderHBars(
      body,
      merchants.map((item) => ({
        label: item.merchant,
        value: item.amount,
        caption: `${item.count} transaction${item.count === 1 ? "" : "s"}`,
      })),
      {
        currency,
        onSelect: (merchant) => {
          this.plugin.store.set({ search: merchant });
          this.plugin.showTransactionsTab();
        },
      },
    );
  }

  /** 6. Account balances. Always all-time — a filtered balance is meaningless. */
  private renderBalancePanel(grid: HTMLElement): void {
    const body = renderPanel(grid, "Balances", "All transactions");
    const balances = deriveBalances(this.plugin.index.accounts(), this.plugin.index.transactions());

    if (!balances.length) {
      body.createEl("p", { cls: "fin-panel-empty", text: "No accounts set up yet." });
      return;
    }

    renderHBars(
      body,
      balances
        .filter((item) => item.balance !== 0)
        .sort((a, b) => b.balance - a.balance)
        .map((item) => ({ label: item.account.name, value: item.balance, caption: item.account.currency })),
      { currency: "" },
    );

    for (const [currency, value] of [...netWorthByCurrency(balances)].sort()) {
      const net = body.createDiv({ cls: "fin-panel-net" });
      net.createSpan({ text: `Net worth (${currency})` });
      net.createSpan({ cls: "fin-amount", text: formatAmount(value) });
    }
  }
}
```

- [x] **Step 3: Style the panels in `styles.css`**

```css
.fin-panel-grid { display: grid; grid-template-columns: 1fr; gap: 12px; padding: 0 var(--fin-gap) 96px; }

@container (min-width: 720px) {
  .fin-panel-grid { grid-template-columns: 1fr 1fr; }
}

.fin-panel { padding: 14px; border-radius: var(--fin-radius); background: var(--fin-raised); }
.fin-panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.fin-panel-title { margin: 0; font-size: 0.95em; font-weight: 700; }
.fin-panel-subtitle { font-size: 0.75em; color: var(--text-muted); white-space: nowrap; }
.fin-panel-currency { font-size: 0.75em; color: var(--text-muted); margin-bottom: 6px; }

.fin-panel-net {
  display: flex; justify-content: space-between; gap: 8px;
  margin-top: 12px; padding-top: 10px;
  border-top: 1px solid var(--fin-border);
  font-size: 0.9em; font-weight: 600;
}
```

- [x] **Step 4: Wire it into the view**

Replace `BudgetView.renderStats` with `this.statsTab.render(this.bodyEl)`, constructing `this.statsTab = new StatsTab(this.plugin)` in `onOpen`.

Add the placeholder plugin method, filled in by Task 5:

```ts
openCategoryEditor(): void {
  new Notice("Coming soon");
}
```

- [ ] **Step 5: Build and verify by hand**

Run: `npm run build`, reload, open Stats with a month that has data.

Check:
1. All six panels render, one column on a phone and two on a wide desktop pane.
2. The donut's slice sizes match the legend percentages, and the centre shows the total.
3. Tapping a donut slice filters the Transactions tab to that category and switches tab.
4. The trend chart shows one bar per day for a month view; switching the period to Year switches it to one bar per month.
5. Every chart has a readable text equivalent beside it — legend or caption.
6. Setting `monthly_budget: 5000` on a category note makes its budget bar appear; spending past 80% turns it amber, past 100% red with an "over" caption.
7. Switch to a light theme: axis lines, labels, and the donut centre text all stay legible.
8. Filter to a category with no expenses and confirm the panels show the empty message rather than an error.

- [x] **Step 6: Commit**

```bash
git add src/ui/components/panel.ts src/ui/tabs/stats-tab.ts src/ui/budget-view.ts src/main.ts styles.css
git commit -m "feat: add stats tab with six panels"
```

---

### Task 5: Category editor

**Files:**
- Create: `src/ui/components/category-editor.ts`
- Modify: `src/main.ts`, `styles.css`

**Interfaces:**
- Consumes: `updateCategoryNote` from `src/data/write.ts`; `CATEGORY_PALETTE`, `categoryColor`, `categoryIcon`.
- Produces: `class CategoryEditorModal extends Modal { constructor(app, plugin) }`

- [x] **Step 1: Write `src/ui/components/category-editor.ts`**

```ts
import { App, Modal, Notice, Setting, setIcon } from "obsidian";
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

  onOpen(): void {
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
          for (const other of swatches.querySelectorAll(".fin-swatch")) other.removeClass("is-active");
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
```

- [x] **Step 2: Wire it up in `src/main.ts`**

```ts
openCategoryEditor(): void {
  new CategoryEditorModal(this.app, this).open();
}
```

And a command:

```ts
this.addCommand({
  id: "edit-categories",
  name: "Edit categories and budgets",
  callback: () => this.openCategoryEditor(),
});
```

- [x] **Step 3: Style it in `styles.css`**

```css
.fin-category-row { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--fin-border); }
.fin-category-glyph {
  flex: 0 0 auto; display: grid; place-items: center;
  width: 38px; height: 38px; border-radius: 50%;
  color: var(--fin-cat-color);
  background: color-mix(in srgb, var(--fin-cat-color) 15%, transparent);
}
.fin-category-body { flex: 1 1 auto; min-width: 0; }
.fin-category-name { font-weight: 600; margin-bottom: 6px; }

.fin-swatches { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; }
.fin-swatch {
  width: 26px; height: 26px; border-radius: 50%;
  border: 2px solid transparent; padding: 0; cursor: pointer;
}
.fin-swatch.is-active { border-color: var(--text-normal); }
```

The swatches are 26px, below the 44px touch minimum, because a 44px circle twelve across does not fit a phone. They sit in a modal reached deliberately, not a primary flow, and each has an `aria-label`. If they prove fiddly in use, drop to six colours at 40px.

- [ ] **Step 4: Build and verify by hand**

Run: `npm run build`, reload.

Check:
1. "Edit categories and budgets" lists every category note with its current colour and icon.
2. Picking a colour updates the glyph immediately and writes `color:` into the category note.
3. Changing the icon writes `icon:` and the Transactions list picks it up on the next render.
4. Setting a budget writes `monthly_budget:` and the budget panel appears on Stats.
5. Clearing a budget removes the field from the note rather than writing `0`.
6. Typing "abc" as a budget shows a notice and changes nothing.

- [x] **Step 5: Commit**

```bash
git add src/ui/components/category-editor.ts src/main.ts styles.css
git commit -m "feat: add category colour, icon and budget editor"
```

---

### Task 6: CSV export

The spec drops the auto-generated `transactions.csv`; this replaces it with an explicit export of whatever is currently filtered.

**Files:**
- Create: `src/ui/export-csv.ts`, `tests/export-csv.test.ts`
- Modify: `src/main.ts`, `src/ui/tabs/stats-tab.ts`

**Interfaces:**
- Consumes: `TransactionRecord`.
- Produces:
  - `toCsv(records: TransactionRecord[]): string` — pure, tested
  - `exportCsv(app: App, records: TransactionRecord[], label: string): Promise<string>` — writes the file, returns its path

- [x] **Step 1: Write the failing test `tests/export-csv.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "../src/ui/export-csv.ts";
import { makeTransaction } from "./helpers/factory.ts";

test("the header lists every exported column", () => {
  const [header] = toCsv([]).split("\n");
  assert.equal(
    header,
    "date,time,amount,currency,type,from_account,to_account,merchant,category,status,excluded,exclude_reason,transaction_id,file",
  );
});

test("a row carries the record's values", () => {
  const csv = toCsv([makeTransaction({
    timestamp: "2026-09-05T14:35:00+03:00", amount: 1420.5, merchant: "Carrefour",
  })]);
  const [, row] = csv.split("\n");
  assert.ok(row.startsWith("2026-09-05,14:35,1420.5,EGP,debit,CIB,,Carrefour,Groceries,parsed,false,,"));
});

test("values containing a comma, a quote or a newline are quoted", () => {
  const csv = toCsv([makeTransaction({ merchant: 'Al "Mahdi", Maadi' })]);
  assert.ok(csv.includes('"Al ""Mahdi"", Maadi"'));

  const multiline = toCsv([makeTransaction({ merchant: "line one\nline two" })]);
  assert.ok(multiline.includes('"line one\nline two"'));
});

test("an excluded record exports its reason", () => {
  const csv = toCsv([makeTransaction({ excluded: true, exclude_reason: "Duplicate SMS" })]);
  assert.ok(csv.includes("true,Duplicate SMS"));
});

test("a missing amount exports as empty, not as zero", () => {
  const csv = toCsv([makeTransaction({ amount: "" })]);
  const [, row] = csv.split("\n");
  assert.equal(row.split(",")[2], "");
});

test("the file ends with a newline", () => {
  assert.ok(toCsv([makeTransaction()]).endsWith("\n"));
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/export-csv.test.ts`
Expected: FAIL — cannot find module `../src/ui/export-csv.ts`.

- [x] **Step 3: Write `src/ui/export-csv.ts`**

```ts
import { App } from "obsidian";
import { ensureFolder } from "../data/vault-json.ts";
import { VAULT_ROOT } from "../constants.ts";
import type { TransactionRecord } from "../data/types.ts";

const COLUMNS = [
  "date", "time", "amount", "currency", "type", "from_account", "to_account",
  "merchant", "category", "status", "excluded", "exclude_reason", "transaction_id", "file",
] as const;

function cell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(records: TransactionRecord[]): string {
  const lines = [COLUMNS.join(",")];
  for (const record of records) {
    lines.push([
      record.date ?? "",
      record.time ?? "",
      record.amount ?? "",
      record.currency,
      record.type,
      record.fromAccount,
      record.toAccount,
      record.merchant,
      record.category,
      record.status,
      record.excluded,
      record.excludeReason,
      record.transactionId,
      record.path,
    ].map(cell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Writes into the vault rather than offering a download: Obsidian on iPhone has
 * no download, and a file in the vault syncs to wherever you want to open it.
 */
export async function exportCsv(
  app: App,
  records: TransactionRecord[],
  label: string,
): Promise<string> {
  const folder = `${VAULT_ROOT}Exports`;
  await ensureFolder(app, folder);
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "export";
  const path = `${folder}/transactions-${slug}.csv`;
  const content = toCsv(records);

  const existing = app.vault.getAbstractFileByPath(path);
  if (existing) await app.vault.adapter.write(path, content);
  else await app.vault.create(path, content);

  return path;
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/export-csv.test.ts`
Expected: PASS, 6 tests.

- [x] **Step 5: Add the export action**

At the end of `StatsTab.render`:

```ts
const actions = container.createDiv({ cls: "fin-stats-actions" });
const exportButton = actions.createEl("button", { cls: "fin-more", text: "Export these transactions as CSV" });
exportButton.addEventListener("click", async () => {
  try {
    const path = await exportCsv(this.plugin.app, records, periodLabel(filter.period));
    new Notice(`Exported ${records.length} transactions to ${path}.`);
  } catch (error) {
    new Notice(`Export failed: ${(error as Error).message}`);
  }
});
```

And a command in `main.ts` that exports the current filter without the view open:

```ts
this.addCommand({
  id: "export-transactions-csv",
  name: "Export filtered transactions as CSV",
  callback: async () => {
    const records = applyFilter(this.index.transactions(), this.store.get(), cairoToday());
    const path = await exportCsv(this.app, records, periodLabel(this.store.get().period));
    new Notice(`Exported ${records.length} transactions to ${path}.`);
  },
});
```

- [ ] **Step 6: Build and verify by hand**

Run: `npm run build`, reload.

Check: exporting September writes `Budget/Exports/transactions-september-2026.csv`; open it and confirm the row count matches the list, that an excluded row is present with `excluded` true, and that a merchant containing a comma is quoted.

- [x] **Step 7: Commit**

```bash
git add src/ui/export-csv.ts tests/export-csv.test.ts src/ui/tabs/stats-tab.ts src/main.ts
git commit -m "feat: export the current filter as CSV"
```

---

### Task 7: Markdown embed

A small read-only summary that can be dropped into any note — the deferred half of the spec's "both" answer on where the UI lives.

**Files:**
- Create: `src/codeblock.ts`
- Modify: `src/main.ts`, `styles.css`

**Interfaces:**
- Consumes: `applyFilter`, `totalsByCurrency`, `spendByCategory`, `categoryColor`, `renderHBars`.
- Produces: `registerFinanceCodeBlock(plugin: FinanceAutomationPlugin): void`

Block syntax:

````markdown
```finance-summary
period: 2026-09
categories: Groceries, Dining
limit: 5
```
````

Every key is optional. `period` accepts `YYYY-MM`, `YYYY`, or `all`, and defaults to the month the note is read in.

- [ ] **Step 1: Write `src/codeblock.ts`**

```ts
import { MarkdownPostProcessorContext, parseYaml } from "obsidian";
import { applyFilter } from "./domain/filter.ts";
import { primaryCurrency, spendByCategory, totalsByCurrency } from "./domain/aggregate.ts";
import { cairoToday } from "./domain/dates.ts";
import { DEFAULT_FILTER } from "./data/types.ts";
import { categoryColor } from "./ui/colors.ts";
import { formatAmount } from "./ui/format.ts";
import { renderHBars } from "./ui/charts/hbars.ts";
import type FinanceAutomationPlugin from "./main.ts";
import type { Filter, Period } from "./data/types.ts";

interface BlockOptions {
  period?: string;
  categories?: string;
  accounts?: string;
  limit?: number;
}

function parsePeriod(value: string | undefined, today: string): Period {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "all") return { unit: "all", anchor: "", from: null, to: null };
  if (/^\d{4}$/.test(text)) return { unit: "year", anchor: text, from: null, to: null };
  if (/^\d{4}-\d{2}$/.test(text)) return { unit: "month", anchor: text, from: null, to: null };
  return { unit: "month", anchor: today.slice(0, 7), from: null, to: null };
}

function splitList(value: string | undefined): string[] {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

export function registerFinanceCodeBlock(plugin: FinanceAutomationPlugin): void {
  plugin.registerMarkdownCodeBlockProcessor(
    "finance-summary",
    (source: string, element: HTMLElement, _context: MarkdownPostProcessorContext) => {
      element.empty();
      element.addClass("finance-budget", "fin-embed");

      let options: BlockOptions = {};
      if (source.trim()) {
        try {
          options = (parseYaml(source) ?? {}) as BlockOptions;
        } catch (error) {
          element.createEl("p", { cls: "fin-embed-error", text: `finance-summary: ${(error as Error).message}` });
          return;
        }
      }

      const today = cairoToday();
      const filter: Filter = {
        ...DEFAULT_FILTER,
        period: parsePeriod(options.period, today),
        categories: splitList(options.categories),
        accounts: splitList(options.accounts),
      };

      const records = applyFilter(plugin.index.transactions(), filter, today);
      if (!records.length) {
        element.createEl("p", { cls: "fin-panel-empty", text: "No transactions for this period." });
        return;
      }

      const currency = primaryCurrency(records);
      const totals = totalsByCurrency(records).get(currency);

      if (totals) {
        const strip = element.createDiv({ cls: "fin-summary-row" });
        for (const [label, value, tone] of [
          ["Income", totals.income, "fin-in"],
          ["Expenses", totals.expenses, "fin-out"],
          ["Net", totals.net, totals.net < 0 ? "fin-out" : "fin-in"],
        ] as const) {
          const cell = strip.createDiv({ cls: "fin-summary-cell" });
          cell.createDiv({ cls: "fin-summary-label", text: label });
          cell.createDiv({ cls: `fin-summary-value fin-amount ${tone}`, text: formatAmount(value) });
        }
      }

      const categories = new Map(plugin.index.categories().map((item) => [item.name, item]));
      renderHBars(
        element,
        spendByCategory(records, currency)
          .slice(0, options.limit ?? 5)
          .map((item) => ({
            label: item.category,
            value: item.amount,
            color: categoryColor(item.category, categories),
          })),
        { currency },
      );

      const open = element.createEl("button", { cls: "fin-more", text: "Open Budget" });
      open.addEventListener("click", () => void plugin.activateBudgetView());
    },
  );
}
```

The embed is deliberately read-only and does not subscribe to the index: a note can hold several of these, and keeping them all live would multiply re-renders for no real gain. It refreshes when the note is re-rendered.

- [ ] **Step 2: Register it**

In `main.ts` `onload`: `registerFinanceCodeBlock(this);`

- [ ] **Step 3: Style it in `styles.css`**

```css
.fin-embed {
  height: auto; padding: 12px;
  border: 1px solid var(--fin-border); border-radius: var(--fin-radius);
  container-type: inline-size;
}
.fin-embed .fin-summary-row { margin-bottom: 12px; }
.fin-embed-error { color: var(--fin-money-out); font-size: 0.85em; margin: 0; }
```

- [ ] **Step 4: Build and verify by hand**

Run: `npm run build`, reload. Create a note containing:

````markdown
```finance-summary
period: 2026-09
limit: 5
```
````

Check: it renders the income/expenses/net strip and the top five categories in both Reading view and Live Preview; a bad `period` falls back to the current month; malformed YAML shows the error message rather than an empty block; "Open Budget" opens the view.

- [ ] **Step 5: Commit**

```bash
git add src/codeblock.ts src/main.ts styles.css
git commit -m "feat: add finance-summary markdown embed"
```

---

### Task 8: Remove the generated reports

**Files:**
- Delete (in the vault): `Budget/Stats/Summary.md`, `Budget/Stats/Needs Review.md`, `Budget/Stats/transactions.csv`
- Modify: `Budget/Stats/README.md`, `Budget/README.md`, `src/main.ts`

- [ ] **Step 1: Confirm nothing still writes them**

Run: `grep -rn "Stats/" src/ || echo "no references"`
Expected: `no references`. If anything appears, it is leftover report code from Plan A, Task 13 — delete it.

- [ ] **Step 2: Check for links into the deleted notes**

Run from the vault root: `grep -rn "Stats/Summary\|Needs Review\|transactions.csv" --include="*.md" . | grep -v obsidian-finance-automation`

Fix or remove any link found. The three files are generated, so nothing should legitimately depend on them — but a dangling `[[Budget/Stats/Summary]]` in a hand-written note is worth catching before the file disappears.

- [ ] **Step 3: Delete the files**

```bash
rm "Budget/Stats/Summary.md" "Budget/Stats/Needs Review.md" "Budget/Stats/transactions.csv"
```

- [ ] **Step 4: Rewrite `Budget/Stats/README.md`**

```markdown
# Stats

Statistics live in the **Budget** view — open it from the wallet icon in the ribbon, or
run **Open Budget** from the command palette, and switch to the Stats tab.

The generated `Summary.md`, `Needs Review.md`, and `transactions.csv` that used to sit
here were removed in version 3.0.0. They were rewritten on every capture, which churned
sync for no benefit once the view existed.

- Transactions needing review are flagged in the Budget view with a banner above the list.
- To get a spreadsheet, use **Export filtered transactions as CSV**; it writes to
  `Budget/Exports/`.
```

- [ ] **Step 5: Update `Budget/README.md`**

Remove the "Recommended workflow" paragraph that points at `Budget/Stats/Needs Review.md`, and replace the folder-map entry for `Budget/Stats/` with `Budget/Exports/`: generated CSV exports, safe to delete.

Also replace the paragraph stating that account balances are never derived from SMS — that is no longer true — with:

```markdown
Account balances are derived: each account note holds an `opening_balance` and an
`opening_date`, and the Budget view adds every transaction since. Because a balance is
only as complete as the messages captured, set `balance:` from a statement occasionally
— the Accounts tab shows how far the derived figure has drifted from it.
```

- [ ] **Step 6: Build, test, and verify**

Run: `npm test && npm run build`, reload Obsidian.

Check: the plugin loads with no error, nothing recreates the deleted files after a capture, and the command palette no longer offers "Refresh statistics".

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove the generated stats reports"
```

---

### Task 9: Release

**Files:**
- Modify: `manifest.json`, `versions.json`, `package.json`, `README.md`, `docs/iphone-shortcuts.md`

- [ ] **Step 1: Bump to 3.0.0**

A major bump: `main.js` is now a build artifact, three generated files are gone, and account notes need `opening_balance`.

- `manifest.json`: `"version": "3.0.0"`
- `package.json`: `"version": "3.0.0"`
- `versions.json`: add `"3.0.0": "1.7.0"`

- [ ] **Step 2: Write the upgrade notes in `README.md`**

```markdown
## Upgrading to 3.0.0

1. Add `opening_balance` and `opening_date` to every note in `Budget/Accounts/`. The
   opening balance is what the account held on the opening date; the Budget view adds
   every transaction since.
2. `Budget/Stats/Summary.md`, `Needs Review.md`, and `transactions.csv` are no longer
   generated and can be deleted. Use the Budget view instead, and **Export filtered
   transactions as CSV** when you want a spreadsheet.
3. `main.js` is now built from the TypeScript sources in `src/`. Run `npm install` and
   `npm run build` after pulling, and do not edit `main.js` by hand.
4. Optional: create `Budget/Settings/exclusion_rules.json` to exclude transactions
   automatically. The editor is under **Edit exclusion rules** in the command palette.
```

- [ ] **Step 3: Check `docs/iphone-shortcuts.md` is still accurate**

The `finance-sms` handler and the note format are unchanged by these plans, so the document should still be correct. Read it and confirm:

- The SMS automation is still two actions and still sends the message only — no sender, no date, no URL encoding.
- The manual Shortcut section still matches the `finance-transaction` parameters the code accepts.
- The minimum version it names is updated from 2.1.0 to 3.0.0 where it talks about installing.
- The account-matching section still points at `Budget/Settings/accounts.json` and its `card_endings`.
- `Budget/Settings/iPhone Shortcut.md` in the vault matches this document.

- [ ] **Step 4: Run everything one last time**

```bash
npm test
npm run build
git status --short
```

Expected: all tests pass, the build exits 0, and the only modified file left is `main.js` if the build changed it.

- [ ] **Step 5: Full manual pass on the iPhone**

Sync the plugin across (or release and update through BRAT), restart Obsidian, and walk the whole flow:

1. Capture a real bank SMS through the Shortcut. The note appears, parses, and lands in the list.
2. It is categorised, or flagged for review in the banner.
3. Its account's balance moves by the right amount on the Accounts tab.
4. An exclusion rule catches a self-transfer and dims it, and the balance does not move.
5. The Stats tab draws all six panels for the month.
6. Export a CSV and open it from the Files app.
7. Switch themes and rotate the phone; nothing breaks.

- [ ] **Step 6: Commit and tag**

```bash
git add -A
git commit -m "release: Finance Automation 3.0.0 with the Budget view"
git tag 3.0.0
```

Push the tag to GitHub so BRAT can install it: `git push origin main --tags`. Then create a GitHub release for `3.0.0` attaching `main.js`, `manifest.json`, and `styles.css` — BRAT reads the release assets, not the repository tree.

---

## Done when

- The Accounts tab shows a derived balance per account, net worth per currency, and flags accounts referenced by transactions but not set up.
- The Stats tab draws all six panels, correct in both themes, each with a text equivalent alongside the chart.
- Tapping a donut slice, a budget bar, a merchant, or an account filters the transaction list to it.
- Category colours, icons, and monthly budgets are editable from the UI.
- The current filter exports to CSV in `Budget/Exports/`.
- A ```` ```finance-summary ```` block renders in any note.
- `Budget/Stats/` no longer holds generated files, and nothing recreates them.
- `npm test` passes and `npm run build` is clean at version 3.0.0.
