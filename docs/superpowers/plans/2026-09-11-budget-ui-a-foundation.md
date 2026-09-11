# Budget UI — Plan A: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Finance Automation plugin onto a TypeScript + esbuild build, and add a fully unit-tested data and domain layer that later UI work reads from — without changing any behaviour a user can see.

**Architecture:** Four layers, each depending only on the one beneath it: `ui/` → `store/` → `domain/` → `data/`. The hard rule that makes this work is that **`domain/` never imports from `obsidian`** — it takes plain record arrays and returns plain results, so every money calculation is a pure function testable in Node. `data/` owns the Obsidian API surface: reading frontmatter through `metadataCache`, writing it through `fileManager.processFrontMatter`.

**Tech Stack:** TypeScript 5, esbuild (single-file bundle), `node:test` + `node:assert/strict`, Obsidian plugin API 1.7.0+.

**Spec:** `docs/superpowers/specs/2026-09-11-budget-ui-design.md`

## Global Constraints

- All paths in this plan are relative to `Budget/obsidian-finance-automation/` unless stated otherwise.
- Plugin id stays `finance-automation`; `manifest.json` `minAppVersion` stays `1.7.0`; `isDesktopOnly` stays `false`.
- The build must emit exactly one `main.js` at the repo root plus `styles.css` and `manifest.json`. BRAT installs those three files and nothing else.
- `main.js` becomes a **build artifact**. It is committed (BRAT needs it in the repo) but never hand-edited.
- **No runtime dependencies.** `package.json` may only ever gain `devDependencies`. No chart library, no UI framework, no date library.
- **No network calls** anywhere in the plugin, at build time or runtime.
- Nothing under `src/domain/` may import from `obsidian`. Task 14 enforces this with a test.
- Vault folder constant stays `Budget/`; the transaction path scheme stays `Budget/Transactions/YYYY/Mon/DDTHH-mm-ss.md`.
- Every write to a transaction note goes through `fileManager.processFrontMatter`. Never `vault.modify` or `vault.process` on a transaction note — the vault syncs to iPhone via `github-gitless-sync` and a whole-file write can clobber a concurrent body edit.
- Currency is never converted. Every aggregate is keyed by currency string.
- Timezone for all date bucketing is Africa/Cairo.

---

## File Structure

Created in this plan:

```
esbuild.config.mjs          build: bundles src/main.ts -> main.js, copies to installed plugin
tsconfig.json               strict TypeScript, no emit (esbuild does the emitting)
src/main.ts                 plugin entry — ported from the old main.js
src/settings.ts             settings tab — ported
src/constants.ts            VAULT_ROOT and derived paths
src/data/types.ts           every record and filter type in the system
src/data/frontmatter.ts     tolerant coercion of frontmatter values
src/data/records.ts         frontmatter -> TransactionRecord / AccountRecord / CategoryRecord
src/data/index-store.ts     TransactionIndex: build, incremental update, subscribe
src/data/vault-json.ts      load/save the JSON files under Budget/Settings/
src/data/write.ts           all frontmatter mutations
src/data/create.ts          new transaction notes (shared by protocol handlers and UI)
src/domain/dates.ts         period maths, Cairo date parts
src/domain/filter.ts        applyFilter
src/domain/aggregate.ts     totals and groupings
src/domain/balances.ts      derived account balances
src/domain/budgets.ts       budget vs spend
src/domain/exclusion.ts     exclusion rule evaluation
src/domain/categorize.ts    keyword categorisation — ported
src/domain/parser/sms.ts    SMS parsing — ported
tests/*.test.ts             one file per domain module
```

Modified: `package.json`, `manifest.json`, `.gitignore`, `main.js` (becomes generated).
Deleted at the end of Task 3: the old hand-written `main.js` content.

---

### Task 1: Build toolchain

Nothing works until the build does. This task produces a `main.js` built from a trivial TypeScript entry point, proving the pipeline before any real code moves.

**Files:**
- Create: `tsconfig.json`, `esbuild.config.mjs`, `src/main.ts`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run build` (one-shot bundle), `npm run dev` (watch + rebuild), `npm test`.

- [x] **Step 1: Add dev dependencies**

```bash
npm install --save-dev typescript@^5.6.0 esbuild@^0.24.0 @types/node@^22.0.0 obsidian@latest builtin-modules@^4.0.0
```

Expected: `package.json` gains a `devDependencies` block. `dependencies` must stay absent.

- [x] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["DOM", "ES2020"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitOverride": true,
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [x] **Step 3: Write `esbuild.config.mjs`**

The `outfile` is the repo-root `main.js`. `copyToVault` also writes the three install files into `.obsidian/plugins/finance-automation/` so a desktop rebuild is live immediately without a manual copy.

```js
import esbuild from "esbuild";
import builtins from "builtin-modules";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const watch = process.argv.includes("--watch");
// Repo lives at <vault>/Budget/obsidian-finance-automation, so the vault root is two up.
const vaultRoot = path.resolve(process.cwd(), "..", "..");
const installDir = path.join(vaultRoot, ".obsidian", "plugins", "finance-automation");

const copyToVault = {
  name: "copy-to-vault",
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length) return;
      await mkdir(installDir, { recursive: true });
      for (const file of ["main.js", "manifest.json", "styles.css"]) {
        await copyFile(path.join(process.cwd(), file), path.join(installDir, file));
      }
      console.log(`copied build to ${installDir}`);
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "main.js",
  format: "cjs",
  platform: "browser",
  target: "es2020",
  logLevel: "info",
  sourcemap: false,
  treeShaking: true,
  minify: false,
  external: ["obsidian", "electron", ...builtins],
  plugins: [copyToVault],
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
```

`sourcemap: false` and `minify: false` are deliberate: the bundle ships to a phone, and a readable stack trace in the Obsidian console is worth more than the bytes.

- [x] **Step 4: Set the scripts in `package.json`**

```json
{
  "scripts": {
    "build": "tsc --noEmit && node esbuild.config.mjs",
    "dev": "node esbuild.config.mjs --watch",
    "typecheck": "tsc --noEmit",
    "test": "node --test tests/"
  }
}
```

`build` typechecks first so a type error fails the build; `dev` skips it for speed.

- [x] **Step 5: Add `node_modules` to `.gitignore`**

```
.DS_Store
node_modules/
```

`main.js` is deliberately **not** ignored — BRAT installs it straight from the repo.

- [x] **Step 6: Write a placeholder `src/main.ts`**

```ts
import { Plugin } from "obsidian";

export default class FinanceAutomationPlugin extends Plugin {
  async onload(): Promise<void> {
    console.log("Finance Automation loaded");
  }
}
```

- [x] **Step 7: Build and verify**

Run: `npm run build`
Expected: exits 0; `main.js` at the repo root is now a small bundle containing `Finance Automation loaded`; the same file appears in `.obsidian/plugins/finance-automation/`.

Verify: `grep -c "Finance Automation loaded" main.js` → `1`

- [x] **Step 8: Commit**

```bash
git add tsconfig.json esbuild.config.mjs package.json package-lock.json .gitignore src/main.ts main.js
git commit -m "build: add TypeScript and esbuild pipeline"
```

---

### Task 2: Types and tolerant frontmatter reading

Every field in this vault is optional and arrives as a string, a number, or missing. One module owns that variation so no other module ever has to think about it.

**Files:**
- Create: `src/constants.ts`, `src/data/types.ts`, `src/data/frontmatter.ts`, `tests/frontmatter.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `VAULT_ROOT = "Budget/"`, `TRANSACTIONS_DIR`, `ACCOUNTS_DIR`, `CATEGORIES_DIR`, `SETTINGS_DIR`
  - `readNumber(value: unknown): number | null`
  - `readString(value: unknown): string`
  - `readBoolean(value: unknown, fallback: boolean): boolean`
  - `readStringList(value: unknown): string[]`
  - Types: `TransactionRecord`, `AccountRecord`, `CategoryRecord`, `Filter`, `Period`, `TransactionType`, `TransactionStatus`, `ExcludeSource`, `ExcludedMode`, `PeriodUnit`

- [x] **Step 1: Write `src/constants.ts`**

```ts
export const VAULT_ROOT = "Budget/";
export const TRANSACTIONS_DIR = `${VAULT_ROOT}Transactions`;
export const ACCOUNTS_DIR = `${VAULT_ROOT}Accounts`;
export const SETTINGS_DIR = `${VAULT_ROOT}Settings`;
export const CATEGORIES_DIR = `${SETTINGS_DIR}/Categories`;
export const RULES_PATH = `${SETTINGS_DIR}/exclusion_rules.json`;
export const CONFIG_PATH = `${SETTINGS_DIR}/config.json`;
export const ACCOUNTS_JSON_PATH = `${SETTINGS_DIR}/accounts.json`;
export const CATEGORY_RULES_PATH = `${CATEGORIES_DIR}/rules.json`;
export const TIMEZONE = "Africa/Cairo";
```

- [x] **Step 2: Write `src/data/types.ts`**

```ts
export type TransactionType = "debit" | "credit" | "transfer" | "fee" | "";
export type TransactionStatus = "pending" | "parsed" | "needs_review";
export type ExcludeSource = "manual" | "rule" | null;

export interface TransactionRecord {
  path: string;
  timestamp: string;
  /** "YYYY-MM-DD" in Africa/Cairo, or null when the timestamp is unreadable. */
  date: string | null;
  /** "YYYY-MM" */
  month: string | null;
  /** "YYYY" */
  year: string | null;
  /** "HH:mm" */
  time: string | null;
  epoch: number | null;
  amount: number | null;
  currency: string;
  fromAccount: string;
  toAccount: string;
  category: string;
  merchant: string;
  type: TransactionType;
  status: TransactionStatus;
  source: string;
  smsMessage: string;
  parserConfidence: number | null;
  transactionId: string;
  excluded: boolean;
  excludeReason: string;
  excludeSource: ExcludeSource;
  excludeRuleId: string;
  /** Lower-cased merchant + sms + category + accounts, for substring search. */
  searchBlob: string;
}

export interface AccountRecord {
  path: string;
  name: string;
  currency: string;
  accountType: string;
  cardEndings: string[];
  aliases: string[];
  openingBalance: number;
  /** "YYYY-MM-DD"; null means count every transaction. */
  openingDate: string | null;
  /** The legacy `balance` field, kept as a statement reference figure. */
  referenceBalance: number | null;
  referenceUpdatedAt: string | null;
  active: boolean;
  includeInNetWorth: boolean;
  institution: string;
}

export interface CategoryRecord {
  path: string;
  name: string;
  currency: string;
  color: string | null;
  icon: string | null;
  monthlyBudget: number | null;
}

export type PeriodUnit = "month" | "year" | "all" | "custom";

export interface Period {
  unit: PeriodUnit;
  /** "YYYY-MM" when unit is "month", "YYYY" when "year". Ignored otherwise. */
  anchor: string;
  /** "YYYY-MM-DD", only used when unit is "custom". */
  from: string | null;
  to: string | null;
}

export type ExcludedMode = "hide" | "show" | "only";

export interface Filter {
  period: Period;
  categories: string[];
  accounts: string[];
  types: TransactionType[];
  statuses: TransactionStatus[];
  search: string;
  amountMin: number | null;
  amountMax: number | null;
  excluded: ExcludedMode;
}

export const DEFAULT_FILTER: Filter = {
  period: { unit: "month", anchor: "", from: null, to: null },
  categories: [],
  accounts: [],
  types: [],
  statuses: [],
  search: "",
  amountMin: null,
  amountMax: null,
  excluded: "hide",
};
```

`DEFAULT_FILTER.period.anchor` is empty because the current month is only known at runtime; the store fills it on creation.

- [x] **Step 3: Write the failing test `tests/frontmatter.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readNumber, readString, readBoolean, readStringList } from "../src/data/frontmatter.ts";

test("readNumber accepts plain numbers", () => {
  assert.equal(readNumber(1234.5), 1234.5);
});

test("readNumber strips thousands separators from strings", () => {
  assert.equal(readNumber("1,234.50"), 1234.5);
});

test("readNumber rejects unusable values", () => {
  for (const value of [null, undefined, "", "abc", NaN, {}]) {
    assert.equal(readNumber(value), null, `expected null for ${JSON.stringify(value)}`);
  }
});

test("readNumber accepts a negative amount", () => {
  assert.equal(readNumber("-40"), -40);
});

test("readString trims and tolerates non-strings", () => {
  assert.equal(readString("  CIB "), "CIB");
  assert.equal(readString(42), "42");
  assert.equal(readString(null), "");
  assert.equal(readString(undefined), "");
});

test("readBoolean understands YAML's several spellings of true", () => {
  for (const value of [true, "true", "True", "yes", "y", 1, "1"]) {
    assert.equal(readBoolean(value, false), true, `expected true for ${JSON.stringify(value)}`);
  }
  for (const value of [false, "false", "no", 0, "0"]) {
    assert.equal(readBoolean(value, true), false, `expected false for ${JSON.stringify(value)}`);
  }
});

test("readBoolean returns the fallback when absent", () => {
  assert.equal(readBoolean(undefined, true), true);
  assert.equal(readBoolean(null, false), false);
  assert.equal(readBoolean("", true), true);
});

test("readStringList handles a list, a single value, and nothing", () => {
  assert.deepEqual(readStringList(["a", "b"]), ["a", "b"]);
  assert.deepEqual(readStringList("a"), ["a"]);
  assert.deepEqual(readStringList(null), []);
  assert.deepEqual(readStringList([1, null, "b", ""]), ["1", "b"]);
});
```

- [x] **Step 4: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../src/data/frontmatter.ts`.

Node 26 strips TypeScript types natively, so `node --test tests/` runs `.ts` files with no transpile step. If the installed Node is older than 22.6, add `"test": "node --experimental-strip-types --test tests/"` instead.

- [x] **Step 5: Write `src/data/frontmatter.ts`**

```ts
export function readString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function readNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

const TRUE_VALUES = new Set(["true", "yes", "y", "1", "on"]);
const FALSE_VALUES = new Set(["false", "no", "n", "0", "off"]);

export function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined || value === "") return fallback;
  const text = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(text)) return true;
  if (FALSE_VALUES.has(text)) return false;
  return fallback;
}

export function readStringList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.map(readString).filter((item) => item.length > 0);
}
```

- [x] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 8 tests.

- [x] **Step 7: Commit**

```bash
git add src/constants.ts src/data/types.ts src/data/frontmatter.ts tests/frontmatter.test.ts
git commit -m "feat: add record types and tolerant frontmatter readers"
```

---

### Task 3: Cairo date handling and period maths

Every date bucket in the app comes from here. It is separated from everything else because timezone arithmetic is the easiest thing in this codebase to get subtly wrong, and a wrong month boundary silently misfiles a transaction.

**Files:**
- Create: `src/domain/dates.ts`, `tests/dates.test.ts`

**Interfaces:**
- Consumes: `Period`, `PeriodUnit` from `src/data/types.ts`.
- Produces:
  - `toDateParts(timestamp: string): { date: string; month: string; year: string; time: string; epoch: number } | null`
  - `cairoToday(now?: Date): string`
  - `resolvePeriod(period: Period, today: string): { from: string; to: string } | null` — `null` means all time
  - `stepPeriod(period: Period, delta: number): Period`
  - `periodLabel(period: Period): string`
  - `addMonths(anchor: string, delta: number): string`
  - `daysBetween(from: string, to: string): string[]`

- [x] **Step 1: Write the failing test `tests/dates.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  toDateParts, cairoToday, resolvePeriod, stepPeriod, periodLabel, addMonths, daysBetween,
} from "../src/domain/dates.ts";
import type { Period } from "../src/data/types.ts";

test("toDateParts reads an ISO timestamp with an explicit offset", () => {
  const parts = toDateParts("2026-08-29T14:35:02+03:00");
  assert.deepEqual(
    { date: parts!.date, month: parts!.month, year: parts!.year, time: parts!.time },
    { date: "2026-08-29", month: "2026-08", year: "2026", time: "14:35" },
  );
});

test("toDateParts reads a naive timestamp as Cairo local time", () => {
  const parts = toDateParts("2026-08-29T14:35:02");
  assert.equal(parts!.date, "2026-08-29");
  assert.equal(parts!.time, "14:35");
});

test("toDateParts converts a UTC timestamp into the Cairo day", () => {
  // 22:30 UTC is 01:30 the next day in Cairo (UTC+3).
  const parts = toDateParts("2026-08-29T22:30:00Z");
  assert.equal(parts!.date, "2026-08-30");
  assert.equal(parts!.month, "2026-08");
});

test("toDateParts returns null for junk", () => {
  assert.equal(toDateParts(""), null);
  assert.equal(toDateParts("not a date"), null);
});

test("cairoToday formats as YYYY-MM-DD", () => {
  assert.match(cairoToday(new Date("2026-09-11T10:00:00Z")), /^2026-09-11$/);
});

test("resolvePeriod bounds a month, including the last day", () => {
  const period: Period = { unit: "month", anchor: "2026-02", from: null, to: null };
  assert.deepEqual(resolvePeriod(period, "2026-09-11"), { from: "2026-02-01", to: "2026-02-28" });
});

test("resolvePeriod handles a leap February", () => {
  const period: Period = { unit: "month", anchor: "2028-02", from: null, to: null };
  assert.deepEqual(resolvePeriod(period, "2028-09-11"), { from: "2028-02-01", to: "2028-02-29" });
});

test("resolvePeriod bounds a year", () => {
  const period: Period = { unit: "year", anchor: "2026", from: null, to: null };
  assert.deepEqual(resolvePeriod(period, "2026-09-11"), { from: "2026-01-01", to: "2026-12-31" });
});

test("resolvePeriod returns null for all time", () => {
  const period: Period = { unit: "all", anchor: "", from: null, to: null };
  assert.equal(resolvePeriod(period, "2026-09-11"), null);
});

test("resolvePeriod passes a custom range through", () => {
  const period: Period = { unit: "custom", anchor: "", from: "2026-03-05", to: "2026-04-02" };
  assert.deepEqual(resolvePeriod(period, "2026-09-11"), { from: "2026-03-05", to: "2026-04-02" });
});

test("resolvePeriod falls back to today's month when the anchor is empty", () => {
  const period: Period = { unit: "month", anchor: "", from: null, to: null };
  assert.deepEqual(resolvePeriod(period, "2026-09-11"), { from: "2026-09-01", to: "2026-09-30" });
});

test("stepPeriod moves a month backwards across a year boundary", () => {
  const period: Period = { unit: "month", anchor: "2026-01", from: null, to: null };
  assert.equal(stepPeriod(period, -1).anchor, "2025-12");
});

test("stepPeriod moves a year", () => {
  const period: Period = { unit: "year", anchor: "2026", from: null, to: null };
  assert.equal(stepPeriod(period, 1).anchor, "2027");
});

test("stepPeriod leaves all-time and custom ranges alone", () => {
  const all: Period = { unit: "all", anchor: "", from: null, to: null };
  assert.deepEqual(stepPeriod(all, -1), all);
  const custom: Period = { unit: "custom", anchor: "", from: "2026-03-05", to: "2026-04-02" };
  assert.deepEqual(stepPeriod(custom, 1), custom);
});

test("periodLabel is human readable", () => {
  assert.equal(periodLabel({ unit: "month", anchor: "2026-09", from: null, to: null }), "September 2026");
  assert.equal(periodLabel({ unit: "year", anchor: "2026", from: null, to: null }), "2026");
  assert.equal(periodLabel({ unit: "all", anchor: "", from: null, to: null }), "All time");
  assert.equal(
    periodLabel({ unit: "custom", anchor: "", from: "2026-03-05", to: "2026-04-02" }),
    "5 Mar 2026 – 2 Apr 2026",
  );
});

test("addMonths wraps both directions", () => {
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(addMonths("2026-06", 7), "2027-01");
});

test("daysBetween is inclusive at both ends", () => {
  assert.deepEqual(daysBetween("2026-01-30", "2026-02-02"), [
    "2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02",
  ]);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/dates.test.ts`
Expected: FAIL — cannot find module `../src/domain/dates.ts`.

- [x] **Step 3: Write `src/domain/dates.ts`**

Dates are handled as plain `YYYY-MM-DD` strings, never `Date` objects, past the parsing boundary. Strings in that format sort and compare lexicographically, which removes a whole category of timezone bug from the filter and aggregate code.

```ts
import type { Period } from "../data/types.ts";

const TIMEZONE = "Africa/Cairo";
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const CAIRO_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});

function formatInCairo(instant: Date): { date: string; time: string } {
  const parts = CAIRO_FORMAT.formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${hour}:${get("minute")}` };
}

/**
 * A timestamp with no offset is treated as already being Cairo wall-clock time —
 * which is what the iPhone Shortcut and the note template produce — so it is read
 * literally rather than reinterpreted. Anything with an offset or a Z is converted.
 */
export function toDateParts(
  timestamp: string,
): { date: string; month: string; year: string; time: string; epoch: number } | null {
  const text = String(timestamp ?? "").trim();
  if (!text) return null;

  const naive = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (naive) {
    const [, year, month, day, hour, minute, second] = naive;
    const epoch = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second ?? "00"}+03:00`);
    return {
      date: `${year}-${month}-${day}`,
      month: `${year}-${month}`,
      year,
      time: `${hour}:${minute}`,
      epoch: Number.isNaN(epoch) ? 0 : epoch,
    };
  }

  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const epoch = Date.parse(`${year}-${month}-${day}T00:00:00+03:00`);
    return {
      date: `${year}-${month}-${day}`, month: `${year}-${month}`, year, time: "00:00",
      epoch: Number.isNaN(epoch) ? 0 : epoch,
    };
  }

  const instant = new Date(text);
  if (Number.isNaN(instant.getTime())) return null;
  const { date, time } = formatInCairo(instant);
  return { date, month: date.slice(0, 7), year: date.slice(0, 4), time, epoch: instant.getTime() };
}

export function cairoToday(now: Date = new Date()): string {
  return formatInCairo(now).date;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function resolvePeriod(period: Period, today: string): { from: string; to: string } | null {
  if (period.unit === "all") return null;

  if (period.unit === "custom") {
    const from = period.from ?? today;
    const to = period.to ?? today;
    return from <= to ? { from, to } : { from: to, to: from };
  }

  if (period.unit === "year") {
    const year = /^\d{4}$/.test(period.anchor) ? period.anchor : today.slice(0, 4);
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }

  const anchor = /^\d{4}-\d{2}$/.test(period.anchor) ? period.anchor : today.slice(0, 7);
  const [year, month] = anchor.split("-").map(Number);
  const last = String(lastDayOfMonth(year, month)).padStart(2, "0");
  return { from: `${anchor}-01`, to: `${anchor}-${last}` };
}

export function addMonths(anchor: string, delta: number): string {
  const [year, month] = anchor.split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

export function stepPeriod(period: Period, delta: number): Period {
  if (period.unit === "month") return { ...period, anchor: addMonths(period.anchor, delta) };
  if (period.unit === "year") return { ...period, anchor: String(Number(period.anchor) + delta) };
  return period;
}

function longDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${Number(day)} ${SHORT_MONTHS[Number(month) - 1]} ${year}`;
}

export function periodLabel(period: Period): string {
  if (period.unit === "all") return "All time";
  if (period.unit === "year") return period.anchor;
  if (period.unit === "custom") {
    return `${longDate(period.from ?? "")} – ${longDate(period.to ?? "")}`;
  }
  const [year, month] = period.anchor.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  while (cursor <= end) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000;
  }
  return days;
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/dates.test.ts`
Expected: PASS, 17 tests.

If `periodLabel` fails on the empty-anchor case, that is expected — `resolvePeriod` handles an empty anchor but `periodLabel` assumes a valid one. The store never produces an empty anchor after initialisation (Plan B, Task 1).

- [x] **Step 5: Commit**

```bash
git add src/domain/dates.ts tests/dates.test.ts
git commit -m "feat: add Cairo date parts and period arithmetic"
```

---

### Task 4: Record construction

Turns raw frontmatter objects into the typed records the rest of the system uses, deriving the date parts and search blob once so filtering never recomputes them.

**Files:**
- Create: `src/data/records.ts`, `tests/records.test.ts`

**Interfaces:**
- Consumes: `readNumber`/`readString`/`readBoolean`/`readStringList`, `toDateParts`.
- Produces:
  - `buildTransaction(frontmatter: Record<string, unknown>, path: string): TransactionRecord`
  - `buildAccount(frontmatter: Record<string, unknown>, path: string): AccountRecord`
  - `buildCategory(frontmatter: Record<string, unknown>, path: string): CategoryRecord`
  - `isTransactionPath(path: string): boolean`

- [x] **Step 1: Write the failing test `tests/records.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildTransaction, buildAccount, buildCategory, isTransactionPath } from "../src/data/records.ts";

test("buildTransaction maps every field and derives date parts", () => {
  const record = buildTransaction({
    type: "transaction",
    timestamp: "2026-08-29T14:35:02+03:00",
    amount: "1,420.50",
    currency: "EGP",
    from_account: "CIB",
    to_account: "",
    category: "Groceries",
    merchant: "Carrefour",
    transaction_type: "debit",
    status: "parsed",
    source: "iphone-shortcut-sms",
    sms_message: "Card 0774 purchase EGP 1,420.50 at Carrefour",
    parser_confidence: 0.8,
    transaction_id: "abc123",
  }, "Budget/Transactions/2026/Aug/29T14-35-02.md");

  assert.equal(record.amount, 1420.5);
  assert.equal(record.date, "2026-08-29");
  assert.equal(record.month, "2026-08");
  assert.equal(record.year, "2026");
  assert.equal(record.time, "14:35");
  assert.equal(record.fromAccount, "CIB");
  assert.equal(record.type, "debit");
  assert.equal(record.excluded, false);
  assert.equal(record.excludeSource, null);
});

test("buildTransaction defaults an unknown status to pending", () => {
  const record = buildTransaction({ status: "nonsense" }, "Budget/Transactions/x.md");
  assert.equal(record.status, "pending");
});

test("buildTransaction defaults an unknown transaction_type to empty", () => {
  const record = buildTransaction({ transaction_type: "wat" }, "Budget/Transactions/x.md");
  assert.equal(record.type, "");
});

test("buildTransaction defaults a missing category to Uncategorized", () => {
  const record = buildTransaction({}, "Budget/Transactions/x.md");
  assert.equal(record.category, "Uncategorized");
});

test("buildTransaction survives an unreadable timestamp", () => {
  const record = buildTransaction({ timestamp: "garbage" }, "Budget/Transactions/x.md");
  assert.equal(record.date, null);
  assert.equal(record.month, null);
  assert.equal(record.epoch, null);
});

test("buildTransaction reads the exclusion fields", () => {
  const record = buildTransaction({
    excluded: true, exclude_reason: "Duplicate SMS",
    exclude_source: "rule", exclude_rule_id: "self-transfer-ahmed",
  }, "Budget/Transactions/x.md");
  assert.equal(record.excluded, true);
  assert.equal(record.excludeReason, "Duplicate SMS");
  assert.equal(record.excludeSource, "rule");
  assert.equal(record.excludeRuleId, "self-transfer-ahmed");
});

test("buildTransaction rejects an unknown exclude_source", () => {
  const record = buildTransaction({ excluded: true, exclude_source: "robot" }, "Budget/Transactions/x.md");
  assert.equal(record.excludeSource, "manual");
});

test("searchBlob is lower-cased and covers merchant, sms, category and accounts", () => {
  const record = buildTransaction({
    merchant: "Carrefour", sms_message: "Purchase at CARREFOUR Maadi",
    category: "Groceries", from_account: "CIB",
  }, "Budget/Transactions/x.md");
  assert.ok(record.searchBlob.includes("carrefour"));
  assert.ok(record.searchBlob.includes("maadi"));
  assert.ok(record.searchBlob.includes("groceries"));
  assert.ok(record.searchBlob.includes("cib"));
  assert.equal(record.searchBlob, record.searchBlob.toLowerCase());
});

test("buildAccount falls back to the file basename for the name", () => {
  const account = buildAccount({ type: "account", currency: "EGP" }, "Budget/Accounts/CIB.md");
  assert.equal(account.name, "CIB");
});

test("buildAccount reads opening balance and keeps the legacy balance as a reference", () => {
  const account = buildAccount({
    type: "account", name: "CIB", currency: "EGP", account_type: "bank",
    opening_balance: "10,000", opening_date: "2026-01-01",
    balance: 9450, balance_updated_at: "2026-09-01T00:00:00",
    card_ending: "0774", active: true, include_in_net_worth: true,
  }, "Budget/Accounts/CIB.md");

  assert.equal(account.openingBalance, 10000);
  assert.equal(account.openingDate, "2026-01-01");
  assert.equal(account.referenceBalance, 9450);
  assert.deepEqual(account.cardEndings, ["0774"]);
});

test("buildAccount defaults openingBalance to zero and openingDate to null", () => {
  const account = buildAccount({ type: "account" }, "Budget/Accounts/Cash.md");
  assert.equal(account.openingBalance, 0);
  assert.equal(account.openingDate, null);
  assert.equal(account.referenceBalance, null);
});

test("buildCategory reads colour, icon and budget", () => {
  const category = buildCategory({
    type: "category", name: "Groceries", currency: "EGP",
    color: "#3B82F6", icon: "shopping-cart", monthly_budget: "5,000",
  }, "Budget/Settings/Categories/Groceries.md");
  assert.equal(category.color, "#3B82F6");
  assert.equal(category.icon, "shopping-cart");
  assert.equal(category.monthlyBudget, 5000);
});

test("buildCategory leaves colour, icon and budget null when unset", () => {
  const category = buildCategory({ type: "category" }, "Budget/Settings/Categories/Bills.md");
  assert.equal(category.color, null);
  assert.equal(category.icon, null);
  assert.equal(category.monthlyBudget, null);
});

test("isTransactionPath accepts transaction notes and rejects the README", () => {
  assert.equal(isTransactionPath("Budget/Transactions/2026/Aug/29T14-35-02.md"), true);
  assert.equal(isTransactionPath("Budget/Transactions/README.md"), false);
  assert.equal(isTransactionPath("Budget/Accounts/CIB.md"), false);
  assert.equal(isTransactionPath("Budget/Transactions/2026/Aug/notes.txt"), false);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/records.test.ts`
Expected: FAIL — cannot find module `../src/data/records.ts`.

- [x] **Step 3: Write `src/data/records.ts`**

```ts
import { readBoolean, readNumber, readString, readStringList } from "./frontmatter.ts";
import { toDateParts } from "../domain/dates.ts";
import { TRANSACTIONS_DIR } from "../constants.ts";
import type {
  AccountRecord, CategoryRecord, ExcludeSource, TransactionRecord, TransactionStatus, TransactionType,
} from "./types.ts";

const TYPES: TransactionType[] = ["debit", "credit", "transfer", "fee"];
const STATUSES: TransactionStatus[] = ["pending", "parsed", "needs_review"];

function basename(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/, "") ?? path;
}

export function isTransactionPath(path: string): boolean {
  return (
    path.startsWith(`${TRANSACTIONS_DIR}/`) &&
    path.endsWith(".md") &&
    path !== `${TRANSACTIONS_DIR}/README.md`
  );
}

export function buildTransaction(
  frontmatter: Record<string, unknown>,
  path: string,
): TransactionRecord {
  const timestamp = readString(frontmatter.timestamp);
  const parts = toDateParts(timestamp);

  const rawType = readString(frontmatter.transaction_type).toLowerCase() as TransactionType;
  const type: TransactionType = TYPES.includes(rawType) ? rawType : "";

  const rawStatus = readString(frontmatter.status).toLowerCase() as TransactionStatus;
  const status: TransactionStatus = STATUSES.includes(rawStatus) ? rawStatus : "pending";

  const excluded = readBoolean(frontmatter.excluded, false);
  const rawSource = readString(frontmatter.exclude_source).toLowerCase();
  const excludeSource: ExcludeSource = !excluded
    ? null
    : rawSource === "rule"
      ? "rule"
      : "manual";

  const merchant = readString(frontmatter.merchant);
  const smsMessage = readString(frontmatter.sms_message);
  const category = readString(frontmatter.category) || "Uncategorized";
  const fromAccount = readString(frontmatter.from_account);
  const toAccount = readString(frontmatter.to_account);

  return {
    path,
    timestamp,
    date: parts?.date ?? null,
    month: parts?.month ?? null,
    year: parts?.year ?? null,
    time: parts?.time ?? null,
    epoch: parts?.epoch ?? null,
    amount: readNumber(frontmatter.amount),
    currency: readString(frontmatter.currency),
    fromAccount,
    toAccount,
    category,
    merchant,
    type,
    status,
    source: readString(frontmatter.source),
    smsMessage,
    parserConfidence: readNumber(frontmatter.parser_confidence),
    transactionId: readString(frontmatter.transaction_id),
    excluded,
    excludeReason: readString(frontmatter.exclude_reason),
    excludeSource,
    excludeRuleId: readString(frontmatter.exclude_rule_id),
    searchBlob: [merchant, smsMessage, category, fromAccount, toAccount]
      .filter(Boolean).join(" ").toLowerCase(),
  };
}

export function buildAccount(
  frontmatter: Record<string, unknown>,
  path: string,
): AccountRecord {
  const cardEndings = readStringList(frontmatter.card_endings);
  const singleEnding = readString(frontmatter.card_ending);
  if (singleEnding && !cardEndings.includes(singleEnding)) cardEndings.push(singleEnding);

  return {
    path,
    name: readString(frontmatter.name) || basename(path),
    currency: readString(frontmatter.currency) || "EGP",
    accountType: readString(frontmatter.account_type) || "bank",
    cardEndings,
    aliases: readStringList(frontmatter.aliases),
    openingBalance: readNumber(frontmatter.opening_balance) ?? 0,
    openingDate: readString(frontmatter.opening_date) || null,
    referenceBalance: readNumber(frontmatter.balance),
    referenceUpdatedAt: readString(frontmatter.balance_updated_at) || null,
    active: readBoolean(frontmatter.active, true),
    includeInNetWorth: readBoolean(frontmatter.include_in_net_worth, true),
    institution: readString(frontmatter.institution),
  };
}

export function buildCategory(
  frontmatter: Record<string, unknown>,
  path: string,
): CategoryRecord {
  return {
    path,
    name: readString(frontmatter.name) || basename(path),
    currency: readString(frontmatter.currency) || "EGP",
    color: readString(frontmatter.color) || null,
    icon: readString(frontmatter.icon) || null,
    monthlyBudget: readNumber(frontmatter.monthly_budget),
  };
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/records.test.ts`
Expected: PASS, 14 tests.

- [x] **Step 5: Commit**

```bash
git add src/data/records.ts tests/records.test.ts
git commit -m "feat: build typed records from frontmatter"
```

---

### Task 5: Filtering

**Files:**
- Create: `src/domain/filter.ts`, `tests/filter.test.ts`, `tests/helpers/factory.ts`

**Interfaces:**
- Consumes: `TransactionRecord`, `Filter`, `resolvePeriod`.
- Produces:
  - `applyFilter(records: TransactionRecord[], filter: Filter, today: string): TransactionRecord[]`
  - `countNeedingReview(records: TransactionRecord[]): number`
  - `distinctCategories(records: TransactionRecord[]): string[]`
  - `distinctAccounts(records: TransactionRecord[]): string[]`
- Also produces the shared test factory `makeTransaction(overrides)` used by every later test file.

- [x] **Step 1: Write the shared test factory `tests/helpers/factory.ts`**

Every later test builds records through this, so a new field added to `TransactionRecord` breaks one file instead of six.

```ts
import { buildTransaction } from "../../src/data/records.ts";
import type { TransactionRecord } from "../../src/data/types.ts";

let counter = 0;

/** Builds a realistic transaction. Pass raw frontmatter keys, not record keys. */
export function makeTransaction(overrides: Record<string, unknown> = {}): TransactionRecord {
  counter += 1;
  return buildTransaction(
    {
      type: "transaction",
      timestamp: "2026-09-05T12:00:00+03:00",
      amount: 100,
      currency: "EGP",
      from_account: "CIB",
      to_account: "",
      category: "Groceries",
      merchant: "Carrefour",
      transaction_type: "debit",
      status: "parsed",
      source: "test",
      ...overrides,
    },
    `Budget/Transactions/2026/Sep/05T12-00-${String(counter).padStart(2, "0")}.md`,
  );
}
```

- [x] **Step 2: Write the failing test `tests/filter.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { applyFilter, countNeedingReview, distinctCategories, distinctAccounts } from "../src/domain/filter.ts";
import { DEFAULT_FILTER } from "../src/data/types.ts";
import type { Filter } from "../src/data/types.ts";
import { makeTransaction } from "./helpers/factory.ts";

const TODAY = "2026-09-11";
const filterOf = (overrides: Partial<Filter> = {}): Filter => ({ ...DEFAULT_FILTER, ...overrides });

test("the default filter keeps the current month and hides excluded", () => {
  const records = [
    makeTransaction({ timestamp: "2026-09-05T12:00:00+03:00" }),
    makeTransaction({ timestamp: "2026-08-05T12:00:00+03:00" }),
    makeTransaction({ timestamp: "2026-09-07T12:00:00+03:00", excluded: true }),
  ];
  const result = applyFilter(records, filterOf(), TODAY);
  assert.equal(result.length, 1);
  assert.equal(result[0].date, "2026-09-05");
});

test("a year period keeps every month of that year", () => {
  const records = [
    makeTransaction({ timestamp: "2026-01-05T12:00:00+03:00" }),
    makeTransaction({ timestamp: "2026-12-31T12:00:00+03:00" }),
    makeTransaction({ timestamp: "2025-12-31T12:00:00+03:00" }),
  ];
  const filter = filterOf({ period: { unit: "year", anchor: "2026", from: null, to: null } });
  assert.equal(applyFilter(records, filter, TODAY).length, 2);
});

test("all time keeps records whose date could not be parsed", () => {
  const records = [makeTransaction({ timestamp: "garbage" }), makeTransaction()];
  const filter = filterOf({ period: { unit: "all", anchor: "", from: null, to: null } });
  assert.equal(applyFilter(records, filter, TODAY).length, 2);
});

test("a bounded period drops records whose date could not be parsed", () => {
  const records = [makeTransaction({ timestamp: "garbage" }), makeTransaction()];
  assert.equal(applyFilter(records, filterOf(), TODAY).length, 1);
});

test("category filter is a union", () => {
  const records = [
    makeTransaction({ category: "Groceries" }),
    makeTransaction({ category: "Dining" }),
    makeTransaction({ category: "Bills" }),
  ];
  const filter = filterOf({ categories: ["Groceries", "Dining"] });
  assert.equal(applyFilter(records, filter, TODAY).length, 2);
});

test("account filter matches either side of the transaction", () => {
  const records = [
    makeTransaction({ from_account: "CIB", to_account: "" }),
    makeTransaction({ from_account: "", to_account: "CIB" }),
    makeTransaction({ from_account: "Cash", to_account: "" }),
  ];
  const filter = filterOf({ accounts: ["CIB"] });
  assert.equal(applyFilter(records, filter, TODAY).length, 2);
});

test("type filter", () => {
  const records = [
    makeTransaction({ transaction_type: "debit" }),
    makeTransaction({ transaction_type: "credit" }),
    makeTransaction({ transaction_type: "transfer" }),
  ];
  assert.equal(applyFilter(records, filterOf({ types: ["credit", "transfer"] }), TODAY).length, 2);
});

test("status filter", () => {
  const records = [
    makeTransaction({ status: "parsed" }),
    makeTransaction({ status: "needs_review" }),
    makeTransaction({ status: "pending" }),
  ];
  assert.equal(applyFilter(records, filterOf({ statuses: ["needs_review", "pending"] }), TODAY).length, 2);
});

test("search matches merchant, SMS body, category and account, case-insensitively", () => {
  const records = [
    makeTransaction({ merchant: "Carrefour" }),
    makeTransaction({ merchant: "Seoudi", sms_message: "purchase at CARREFOUR maadi" }),
    makeTransaction({ merchant: "Uber", category: "Transport" }),
  ];
  assert.equal(applyFilter(records, filterOf({ search: "carrefour" }), TODAY).length, 2);
  assert.equal(applyFilter(records, filterOf({ search: "TRANSPORT" }), TODAY).length, 1);
});

test("search matches an Arabic SMS body", () => {
  const records = [
    makeTransaction({ sms_message: "تم خصم مبلغ 250 جم من حساب" }),
    makeTransaction({ sms_message: "purchase at Carrefour" }),
  ];
  assert.equal(applyFilter(records, filterOf({ search: "خصم" }), TODAY).length, 1);
});

test("amount range is inclusive at both ends", () => {
  const records = [
    makeTransaction({ amount: 50 }), makeTransaction({ amount: 100 }), makeTransaction({ amount: 150 }),
  ];
  const filter = filterOf({ amountMin: 50, amountMax: 100 });
  assert.equal(applyFilter(records, filter, TODAY).length, 2);
});

test("amount range compares the absolute amount", () => {
  const records = [makeTransaction({ amount: -120 })];
  assert.equal(applyFilter(records, filterOf({ amountMin: 100 }), TODAY).length, 1);
});

test("excluded mode: hide, show and only", () => {
  const records = [makeTransaction(), makeTransaction({ excluded: true })];
  assert.equal(applyFilter(records, filterOf({ excluded: "hide" }), TODAY).length, 1);
  assert.equal(applyFilter(records, filterOf({ excluded: "show" }), TODAY).length, 2);
  const only = applyFilter(records, filterOf({ excluded: "only" }), TODAY);
  assert.equal(only.length, 1);
  assert.equal(only[0].excluded, true);
});

test("filters combine with AND", () => {
  const records = [
    makeTransaction({ category: "Groceries", from_account: "CIB", amount: 100 }),
    makeTransaction({ category: "Groceries", from_account: "Cash", amount: 100 }),
    makeTransaction({ category: "Dining", from_account: "CIB", amount: 100 }),
  ];
  const filter = filterOf({ categories: ["Groceries"], accounts: ["CIB"] });
  assert.equal(applyFilter(records, filter, TODAY).length, 1);
});

test("results are ordered newest first", () => {
  const records = [
    makeTransaction({ timestamp: "2026-09-01T09:00:00+03:00" }),
    makeTransaction({ timestamp: "2026-09-08T09:00:00+03:00" }),
    makeTransaction({ timestamp: "2026-09-04T09:00:00+03:00" }),
  ];
  const result = applyFilter(records, filterOf(), TODAY);
  assert.deepEqual(result.map((item) => item.date), ["2026-09-08", "2026-09-04", "2026-09-01"]);
});

test("countNeedingReview counts non-parsed and amount-less records, ignoring excluded", () => {
  const records = [
    makeTransaction({ status: "parsed" }),
    makeTransaction({ status: "needs_review" }),
    makeTransaction({ status: "pending" }),
    makeTransaction({ status: "parsed", amount: "" }),
    makeTransaction({ status: "needs_review", excluded: true }),
  ];
  assert.equal(countNeedingReview(records), 3);
});

test("distinctCategories and distinctAccounts are sorted and deduplicated", () => {
  const records = [
    makeTransaction({ category: "Dining", from_account: "CIB", to_account: "" }),
    makeTransaction({ category: "Bills", from_account: "Cash", to_account: "CIB" }),
    makeTransaction({ category: "Dining", from_account: "CIB", to_account: "" }),
  ];
  assert.deepEqual(distinctCategories(records), ["Bills", "Dining"]);
  // Locale-aware sort, so "Cash" precedes "CIB" the way a reader expects.
  assert.deepEqual(distinctAccounts(records), ["Cash", "CIB"]);
});
```

- [x] **Step 3: Run the test to verify it fails**

Run: `node --test tests/filter.test.ts`
Expected: FAIL — cannot find module `../src/domain/filter.ts`.

- [x] **Step 4: Write `src/domain/filter.ts`**

```ts
import { resolvePeriod } from "./dates.ts";
import type { Filter, TransactionRecord } from "../data/types.ts";

export function applyFilter(
  records: TransactionRecord[],
  filter: Filter,
  today: string,
): TransactionRecord[] {
  const range = resolvePeriod(filter.period, today);
  const search = filter.search.trim().toLowerCase();
  const categories = new Set(filter.categories);
  const accounts = new Set(filter.accounts);
  const types = new Set(filter.types);
  const statuses = new Set(filter.statuses);

  const matched = records.filter((record) => {
    if (filter.excluded === "hide" && record.excluded) return false;
    if (filter.excluded === "only" && !record.excluded) return false;

    if (range) {
      if (!record.date) return false;
      if (record.date < range.from || record.date > range.to) return false;
    }

    if (categories.size && !categories.has(record.category)) return false;

    if (accounts.size && !accounts.has(record.fromAccount) && !accounts.has(record.toAccount)) {
      return false;
    }

    if (types.size && !types.has(record.type)) return false;
    if (statuses.size && !statuses.has(record.status)) return false;
    if (search && !record.searchBlob.includes(search)) return false;

    if (filter.amountMin !== null || filter.amountMax !== null) {
      if (record.amount === null) return false;
      const magnitude = Math.abs(record.amount);
      if (filter.amountMin !== null && magnitude < filter.amountMin) return false;
      if (filter.amountMax !== null && magnitude > filter.amountMax) return false;
    }

    return true;
  });

  // Newest first. Records with no readable timestamp sort to the end.
  return matched.sort((a, b) => (b.epoch ?? -Infinity) - (a.epoch ?? -Infinity));
}

export function countNeedingReview(records: TransactionRecord[]): number {
  return records.filter(
    (record) => !record.excluded && (record.status !== "parsed" || record.amount === null),
  ).length;
}

export function distinctCategories(records: TransactionRecord[]): string[] {
  const names = new Set(records.map((record) => record.category).filter(Boolean));
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function distinctAccounts(records: TransactionRecord[]): string[] {
  const names = new Set<string>();
  for (const record of records) {
    if (record.fromAccount) names.add(record.fromAccount);
    if (record.toAccount) names.add(record.toAccount);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/filter.test.ts`
Expected: PASS, 17 tests.

- [x] **Step 6: Commit**

```bash
git add src/domain/filter.ts tests/filter.test.ts tests/helpers/factory.ts
git commit -m "feat: add transaction filtering"
```

---

### Task 6: Aggregation

The heart of the Stats tab and the summary strip. Two rules govern every function here: **excluded records never contribute**, and **transfers are never income or expense**.

**Files:**
- Create: `src/domain/aggregate.ts`, `tests/aggregate.test.ts`

**Interfaces:**
- Consumes: `TransactionRecord`, `daysBetween`, `addMonths`.
- Produces:
  - `interface Totals { income: number; expenses: number; transfers: number; net: number; count: number }`
  - `totalsByCurrency(records): Map<string, Totals>`
  - `spendByCategory(records, currency): Array<{ category: string; amount: number; count: number }>`
  - `spendByMerchant(records, currency, limit): Array<{ merchant: string; amount: number; count: number }>`
  - `spendByDay(records, currency, from, to): Array<{ date: string; amount: number }>`
  - `spendByMonth(records, currency, fromMonth, toMonth): Array<{ month: string; amount: number }>`
  - `groupByDay(records): Array<{ date: string; records: TransactionRecord[]; totals: Map<string, Totals> }>`
  - `primaryCurrency(records): string`

- [x] **Step 1: Write the failing test `tests/aggregate.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  totalsByCurrency, spendByCategory, spendByMerchant, spendByDay, spendByMonth,
  groupByDay, primaryCurrency,
} from "../src/domain/aggregate.ts";
import { makeTransaction } from "./helpers/factory.ts";

test("totals split income, expenses and transfers", () => {
  const records = [
    makeTransaction({ transaction_type: "debit", amount: 100 }),
    makeTransaction({ transaction_type: "fee", amount: 25 }),
    makeTransaction({ transaction_type: "credit", amount: 5000 }),
    makeTransaction({ transaction_type: "transfer", amount: 300 }),
  ];
  const totals = totalsByCurrency(records).get("EGP")!;
  assert.equal(totals.income, 5000);
  assert.equal(totals.expenses, 125);
  assert.equal(totals.transfers, 300);
  assert.equal(totals.net, 4875);
  assert.equal(totals.count, 4);
});

test("a fee counts as an expense", () => {
  const totals = totalsByCurrency([makeTransaction({ transaction_type: "fee", amount: 25 })]).get("EGP")!;
  assert.equal(totals.expenses, 25);
});

test("excluded records contribute nothing at all", () => {
  const records = [
    makeTransaction({ transaction_type: "debit", amount: 100 }),
    makeTransaction({ transaction_type: "debit", amount: 999, excluded: true }),
  ];
  const totals = totalsByCurrency(records).get("EGP")!;
  assert.equal(totals.expenses, 100);
  assert.equal(totals.count, 1);
});

test("records with no amount contribute nothing", () => {
  const totals = totalsByCurrency([makeTransaction({ amount: "" })]).get("EGP")!;
  assert.equal(totals.expenses, 0);
  assert.equal(totals.count, 0);
});

test("currencies never mix", () => {
  const records = [
    makeTransaction({ currency: "EGP", amount: 100 }),
    makeTransaction({ currency: "USD", amount: 20 }),
  ];
  const totals = totalsByCurrency(records);
  assert.equal(totals.get("EGP")!.expenses, 100);
  assert.equal(totals.get("USD")!.expenses, 20);
  assert.equal(totals.size, 2);
});

test("amounts are treated as magnitudes regardless of sign", () => {
  const records = [
    makeTransaction({ transaction_type: "debit", amount: -100 }),
    makeTransaction({ transaction_type: "debit", amount: 100 }),
  ];
  assert.equal(totalsByCurrency(records).get("EGP")!.expenses, 200);
});

test("spendByCategory excludes transfers and income, sorted descending", () => {
  const records = [
    makeTransaction({ category: "Groceries", amount: 100, transaction_type: "debit" }),
    makeTransaction({ category: "Groceries", amount: 50, transaction_type: "debit" }),
    makeTransaction({ category: "Dining", amount: 400, transaction_type: "debit" }),
    makeTransaction({ category: "Income", amount: 9000, transaction_type: "credit" }),
    makeTransaction({ category: "Transfer", amount: 700, transaction_type: "transfer" }),
  ];
  assert.deepEqual(spendByCategory(records, "EGP"), [
    { category: "Dining", amount: 400, count: 1 },
    { category: "Groceries", amount: 150, count: 2 },
  ]);
});

test("spendByMerchant groups case-insensitively and honours the limit", () => {
  const records = [
    makeTransaction({ merchant: "Carrefour", amount: 100, transaction_type: "debit" }),
    makeTransaction({ merchant: "carrefour", amount: 50, transaction_type: "debit" }),
    makeTransaction({ merchant: "Seoudi", amount: 400, transaction_type: "debit" }),
    makeTransaction({ merchant: "Uber", amount: 30, transaction_type: "debit" }),
  ];
  const top = spendByMerchant(records, "EGP", 2);
  assert.equal(top.length, 2);
  assert.deepEqual(top[0], { merchant: "Seoudi", amount: 400, count: 1 });
  assert.deepEqual(top[1], { merchant: "Carrefour", amount: 150, count: 2 });
});

test("spendByMerchant skips records with no merchant", () => {
  const records = [makeTransaction({ merchant: "", amount: 100, transaction_type: "debit" })];
  assert.deepEqual(spendByMerchant(records, "EGP", 10), []);
});

test("spendByDay emits every day in range including empty ones", () => {
  const records = [
    makeTransaction({ timestamp: "2026-09-02T10:00:00+03:00", amount: 100, transaction_type: "debit" }),
    makeTransaction({ timestamp: "2026-09-02T18:00:00+03:00", amount: 40, transaction_type: "debit" }),
    makeTransaction({ timestamp: "2026-09-04T10:00:00+03:00", amount: 70, transaction_type: "debit" }),
  ];
  assert.deepEqual(spendByDay(records, "EGP", "2026-09-01", "2026-09-04"), [
    { date: "2026-09-01", amount: 0 },
    { date: "2026-09-02", amount: 140 },
    { date: "2026-09-03", amount: 0 },
    { date: "2026-09-04", amount: 70 },
  ]);
});

test("spendByMonth emits every month in range", () => {
  const records = [
    makeTransaction({ timestamp: "2026-01-15T10:00:00+03:00", amount: 100, transaction_type: "debit" }),
    makeTransaction({ timestamp: "2026-03-15T10:00:00+03:00", amount: 300, transaction_type: "debit" }),
  ];
  assert.deepEqual(spendByMonth(records, "EGP", "2026-01", "2026-03"), [
    { month: "2026-01", amount: 100 },
    { month: "2026-02", amount: 0 },
    { month: "2026-03", amount: 300 },
  ]);
});

test("groupByDay groups, orders newest first, and totals each day", () => {
  const records = [
    makeTransaction({ timestamp: "2026-09-02T10:00:00+03:00", amount: 100, transaction_type: "debit" }),
    makeTransaction({ timestamp: "2026-09-04T10:00:00+03:00", amount: 70, transaction_type: "debit" }),
    makeTransaction({ timestamp: "2026-09-02T18:00:00+03:00", amount: 40, transaction_type: "debit" }),
  ];
  const groups = groupByDay(records);
  assert.deepEqual(groups.map((group) => group.date), ["2026-09-04", "2026-09-02"]);
  assert.equal(groups[1].records.length, 2);
  assert.equal(groups[1].totals.get("EGP")!.expenses, 140);
});

test("groupByDay keeps excluded records visible but out of the day total", () => {
  const records = [
    makeTransaction({ timestamp: "2026-09-02T10:00:00+03:00", amount: 100, transaction_type: "debit" }),
    makeTransaction({ timestamp: "2026-09-02T11:00:00+03:00", amount: 999, transaction_type: "debit", excluded: true }),
  ];
  const [group] = groupByDay(records);
  assert.equal(group.records.length, 2);
  assert.equal(group.totals.get("EGP")!.expenses, 100);
});

test("groupByDay puts undated records in their own bucket last", () => {
  const records = [makeTransaction({ timestamp: "garbage" }), makeTransaction()];
  const groups = groupByDay(records);
  assert.equal(groups.at(-1)!.date, "");
});

test("primaryCurrency is the one with the most records", () => {
  const records = [
    makeTransaction({ currency: "USD" }),
    makeTransaction({ currency: "EGP" }),
    makeTransaction({ currency: "EGP" }),
  ];
  assert.equal(primaryCurrency(records), "EGP");
  assert.equal(primaryCurrency([]), "EGP");
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/aggregate.test.ts`
Expected: FAIL — cannot find module `../src/domain/aggregate.ts`.

- [x] **Step 3: Write `src/domain/aggregate.ts`**

```ts
import { addMonths, daysBetween } from "./dates.ts";
import type { TransactionRecord } from "../data/types.ts";

export interface Totals {
  income: number;
  expenses: number;
  transfers: number;
  net: number;
  count: number;
}

function emptyTotals(): Totals {
  return { income: 0, expenses: 0, transfers: 0, net: 0, count: 0 };
}

/** A record counts only when it has a usable amount and is not excluded. */
function counts(record: TransactionRecord): boolean {
  return !record.excluded && record.amount !== null;
}

function magnitude(record: TransactionRecord): number {
  return Math.abs(record.amount ?? 0);
}

/** Expenses are debits and fees. Transfers are never income or expense. */
function isExpense(record: TransactionRecord): boolean {
  return record.type === "debit" || record.type === "fee";
}

export function totalsByCurrency(records: TransactionRecord[]): Map<string, Totals> {
  const result = new Map<string, Totals>();
  for (const record of records) {
    if (!counts(record)) continue;
    const currency = record.currency || "Unknown";
    const totals = result.get(currency) ?? emptyTotals();
    const value = magnitude(record);
    totals.count += 1;
    if (record.type === "credit") totals.income += value;
    else if (isExpense(record)) totals.expenses += value;
    else if (record.type === "transfer") totals.transfers += value;
    totals.net = totals.income - totals.expenses;
    result.set(currency, totals);
  }
  return result;
}

function sumBy(
  records: TransactionRecord[],
  currency: string,
  keyOf: (record: TransactionRecord) => string | null,
  labelOf: (record: TransactionRecord) => string,
): Array<{ key: string; label: string; amount: number; count: number }> {
  const buckets = new Map<string, { label: string; amount: number; count: number }>();
  for (const record of records) {
    if (!counts(record) || record.currency !== currency || !isExpense(record)) continue;
    const key = keyOf(record);
    if (!key) continue;
    const bucket = buckets.get(key) ?? { label: labelOf(record), amount: 0, count: 0 };
    bucket.amount += magnitude(record);
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets]
    .map(([key, bucket]) => ({ key, ...bucket }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}

export function spendByCategory(
  records: TransactionRecord[],
  currency: string,
): Array<{ category: string; amount: number; count: number }> {
  return sumBy(records, currency, (record) => record.category, (record) => record.category)
    .map(({ label, amount, count }) => ({ category: label, amount, count }));
}

export function spendByMerchant(
  records: TransactionRecord[],
  currency: string,
  limit: number,
): Array<{ merchant: string; amount: number; count: number }> {
  return sumBy(
    records,
    currency,
    (record) => (record.merchant ? record.merchant.toLowerCase() : null),
    (record) => record.merchant,
  )
    .slice(0, limit)
    .map(({ label, amount, count }) => ({ merchant: label, amount, count }));
}

export function spendByDay(
  records: TransactionRecord[],
  currency: string,
  from: string,
  to: string,
): Array<{ date: string; amount: number }> {
  const byDate = new Map<string, number>();
  for (const record of records) {
    if (!counts(record) || record.currency !== currency || !isExpense(record) || !record.date) continue;
    byDate.set(record.date, (byDate.get(record.date) ?? 0) + magnitude(record));
  }
  return daysBetween(from, to).map((date) => ({ date, amount: byDate.get(date) ?? 0 }));
}

export function spendByMonth(
  records: TransactionRecord[],
  currency: string,
  fromMonth: string,
  toMonth: string,
): Array<{ month: string; amount: number }> {
  const byMonth = new Map<string, number>();
  for (const record of records) {
    if (!counts(record) || record.currency !== currency || !isExpense(record) || !record.month) continue;
    byMonth.set(record.month, (byMonth.get(record.month) ?? 0) + magnitude(record));
  }
  const months: Array<{ month: string; amount: number }> = [];
  let cursor = fromMonth;
  while (cursor <= toMonth) {
    months.push({ month: cursor, amount: byMonth.get(cursor) ?? 0 });
    cursor = addMonths(cursor, 1);
  }
  return months;
}

export function groupByDay(
  records: TransactionRecord[],
): Array<{ date: string; records: TransactionRecord[]; totals: Map<string, Totals> }> {
  const buckets = new Map<string, TransactionRecord[]>();
  for (const record of records) {
    const date = record.date ?? "";
    const bucket = buckets.get(date) ?? [];
    bucket.push(record);
    buckets.set(date, bucket);
  }
  return [...buckets]
    // Newest first; the empty-date bucket sorts last because "" is smallest.
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, dayRecords]) => ({ date, records: dayRecords, totals: totalsByCurrency(dayRecords) }));
}

export function primaryCurrency(records: TransactionRecord[]): string {
  const counted = new Map<string, number>();
  for (const record of records) {
    if (!record.currency) continue;
    counted.set(record.currency, (counted.get(record.currency) ?? 0) + 1);
  }
  const ranked = [...counted].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked[0]?.[0] ?? "EGP";
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/aggregate.test.ts`
Expected: PASS, 15 tests.

- [x] **Step 5: Commit**

```bash
git add src/domain/aggregate.ts tests/aggregate.test.ts
git commit -m "feat: add spending aggregation"
```

---

### Task 7: Derived account balances

Per the spec, balance is derived from an opening balance plus every non-excluded transaction. This is the calculation most likely to be quietly wrong, so it gets its own module and thorough tests.

**Files:**
- Create: `src/domain/balances.ts`, `tests/balances.test.ts`

**Interfaces:**
- Consumes: `AccountRecord`, `TransactionRecord`.
- Produces:
  - `interface AccountBalance { account: AccountRecord; balance: number; moneyIn: number; moneyOut: number; transactionCount: number; drift: number | null }`
  - `deriveBalances(accounts: AccountRecord[], records: TransactionRecord[]): AccountBalance[]`
  - `netWorthByCurrency(balances: AccountBalance[]): Map<string, number>`
  - `unknownAccountNames(accounts: AccountRecord[], records: TransactionRecord[]): string[]`

- [x] **Step 1: Write the failing test `tests/balances.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { deriveBalances, netWorthByCurrency, unknownAccountNames } from "../src/domain/balances.ts";
import { buildAccount } from "../src/data/records.ts";
import { makeTransaction } from "./helpers/factory.ts";

const account = (overrides: Record<string, unknown> = {}) =>
  buildAccount({ type: "account", name: "CIB", currency: "EGP", account_type: "bank", ...overrides },
    `Budget/Accounts/${overrides.name ?? "CIB"}.md`);

test("balance is opening balance minus debits plus credits", () => {
  const accounts = [account({ opening_balance: 10000 })];
  const records = [
    makeTransaction({ transaction_type: "debit", amount: 400, from_account: "CIB" }),
    makeTransaction({ transaction_type: "credit", amount: 1500, from_account: "", to_account: "CIB" }),
  ];
  const [result] = deriveBalances(accounts, records);
  assert.equal(result.balance, 11100);
  assert.equal(result.moneyOut, 400);
  assert.equal(result.moneyIn, 1500);
  assert.equal(result.transactionCount, 2);
});

test("a fee reduces the balance", () => {
  const records = [makeTransaction({ transaction_type: "fee", amount: 25, from_account: "CIB" })];
  assert.equal(deriveBalances([account({ opening_balance: 1000 })], records)[0].balance, 975);
});

test("a transfer moves money out of one account and into the other", () => {
  const accounts = [
    account({ name: "CIB", opening_balance: 5000 }),
    account({ name: "Cash", opening_balance: 0 }),
  ];
  const records = [
    makeTransaction({ transaction_type: "transfer", amount: 800, from_account: "CIB", to_account: "Cash" }),
  ];
  const balances = deriveBalances(accounts, records);
  assert.equal(balances.find((item) => item.account.name === "CIB")!.balance, 4200);
  assert.equal(balances.find((item) => item.account.name === "Cash")!.balance, 800);
});

test("excluded transactions never move a balance", () => {
  const records = [
    makeTransaction({ transaction_type: "debit", amount: 400, from_account: "CIB" }),
    makeTransaction({ transaction_type: "debit", amount: 9999, from_account: "CIB", excluded: true }),
  ];
  assert.equal(deriveBalances([account({ opening_balance: 10000 })], records)[0].balance, 9600);
});

test("transactions before opening_date are ignored", () => {
  const accounts = [account({ opening_balance: 10000, opening_date: "2026-09-01" })];
  const records = [
    makeTransaction({ timestamp: "2026-08-20T10:00:00+03:00", transaction_type: "debit", amount: 500, from_account: "CIB" }),
    makeTransaction({ timestamp: "2026-09-02T10:00:00+03:00", transaction_type: "debit", amount: 300, from_account: "CIB" }),
  ];
  assert.equal(deriveBalances(accounts, records)[0].balance, 9700);
});

test("a transaction on opening_date itself is counted", () => {
  const accounts = [account({ opening_balance: 1000, opening_date: "2026-09-02" })];
  const records = [
    makeTransaction({ timestamp: "2026-09-02T10:00:00+03:00", transaction_type: "debit", amount: 300, from_account: "CIB" }),
  ];
  assert.equal(deriveBalances(accounts, records)[0].balance, 700);
});

test("account matching is case-insensitive and trims whitespace", () => {
  const records = [makeTransaction({ transaction_type: "debit", amount: 100, from_account: "  cib " })];
  assert.equal(deriveBalances([account({ opening_balance: 500 })], records)[0].balance, 400);
});

test("records with no amount are ignored", () => {
  const records = [makeTransaction({ transaction_type: "debit", amount: "", from_account: "CIB" })];
  const [result] = deriveBalances([account({ opening_balance: 500 })], records);
  assert.equal(result.balance, 500);
  assert.equal(result.transactionCount, 0);
});

test("drift is the reference balance minus the derived balance, or null when absent", () => {
  const records = [makeTransaction({ transaction_type: "debit", amount: 100, from_account: "CIB" })];
  const withReference = deriveBalances([account({ opening_balance: 1000, balance: 880 })], records)[0];
  assert.equal(withReference.balance, 900);
  assert.equal(withReference.drift, -20);
  assert.equal(deriveBalances([account({ opening_balance: 1000 })], records)[0].drift, null);
});

test("inactive accounts are excluded entirely", () => {
  const accounts = [account({ name: "CIB" }), account({ name: "Old", active: false })];
  assert.deepEqual(deriveBalances(accounts, []).map((item) => item.account.name), ["CIB"]);
});

test("net worth sums per currency and respects include_in_net_worth", () => {
  const accounts = [
    account({ name: "CIB", currency: "EGP", opening_balance: 5000 }),
    account({ name: "Cash", currency: "EGP", opening_balance: 300 }),
    account({ name: "Wise", currency: "USD", opening_balance: 200 }),
    account({ name: "Loan", currency: "EGP", opening_balance: -1000, include_in_net_worth: false }),
  ];
  const netWorth = netWorthByCurrency(deriveBalances(accounts, []));
  assert.equal(netWorth.get("EGP"), 5300);
  assert.equal(netWorth.get("USD"), 200);
});

test("unknownAccountNames lists names used by transactions but not configured", () => {
  const accounts = [account({ name: "CIB" })];
  const records = [
    makeTransaction({ from_account: "CIB" }),
    makeTransaction({ from_account: "Card ••••1234" }),
    makeTransaction({ from_account: "", to_account: "Vodafone Cash" }),
  ];
  assert.deepEqual(unknownAccountNames(accounts, records), ["Card ••••1234", "Vodafone Cash"]);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/balances.test.ts`
Expected: FAIL — cannot find module `../src/domain/balances.ts`.

- [x] **Step 3: Write `src/domain/balances.ts`**

```ts
import type { AccountRecord, TransactionRecord } from "../data/types.ts";

export interface AccountBalance {
  account: AccountRecord;
  balance: number;
  moneyIn: number;
  moneyOut: number;
  transactionCount: number;
  /** referenceBalance − derived balance, or null when no statement figure is recorded. */
  drift: number | null;
}

const key = (name: string): string => name.trim().toLowerCase();

export function deriveBalances(
  accounts: AccountRecord[],
  records: TransactionRecord[],
): AccountBalance[] {
  const active = accounts.filter((account) => account.active);
  const byKey = new Map(active.map((account) => [key(account.name), account]));

  const state = new Map<string, { moneyIn: number; moneyOut: number; count: number }>();
  for (const account of active) state.set(key(account.name), { moneyIn: 0, moneyOut: 0, count: 0 });

  for (const record of records) {
    if (record.excluded || record.amount === null) continue;
    const value = Math.abs(record.amount);

    const apply = (name: string, direction: "in" | "out"): boolean => {
      const accountKey = key(name);
      const account = byKey.get(accountKey);
      if (!account) return false;
      // A transaction before the opening balance was struck is already baked into it.
      if (account.openingDate && record.date && record.date < account.openingDate) return false;
      const bucket = state.get(accountKey)!;
      if (direction === "in") bucket.moneyIn += value;
      else bucket.moneyOut += value;
      bucket.count += 1;
      return true;
    };

    if (record.type === "credit") {
      apply(record.toAccount || record.fromAccount, "in");
    } else if (record.type === "debit" || record.type === "fee") {
      apply(record.fromAccount, "out");
    } else if (record.type === "transfer") {
      apply(record.fromAccount, "out");
      apply(record.toAccount, "in");
    }
  }

  return active.map((account) => {
    const bucket = state.get(key(account.name))!;
    const balance = account.openingBalance + bucket.moneyIn - bucket.moneyOut;
    return {
      account,
      balance,
      moneyIn: bucket.moneyIn,
      moneyOut: bucket.moneyOut,
      transactionCount: bucket.count,
      drift: account.referenceBalance === null ? null : account.referenceBalance - balance,
    };
  });
}

export function netWorthByCurrency(balances: AccountBalance[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of balances) {
    if (!item.account.includeInNetWorth) continue;
    const currency = item.account.currency || "Unknown";
    result.set(currency, (result.get(currency) ?? 0) + item.balance);
  }
  return result;
}

export function unknownAccountNames(
  accounts: AccountRecord[],
  records: TransactionRecord[],
): string[] {
  const known = new Set(accounts.map((account) => key(account.name)));
  const unknown = new Map<string, string>();
  for (const record of records) {
    for (const name of [record.fromAccount, record.toAccount]) {
      if (!name) continue;
      if (known.has(key(name))) continue;
      if (!unknown.has(key(name))) unknown.set(key(name), name.trim());
    }
  }
  return [...unknown.values()].sort((a, b) => a.localeCompare(b));
}
```

Note the `credit` branch falls back to `fromAccount` when `toAccount` is empty: the structured capture link writes a credit's account into `to_account`, but a hand-written note sometimes puts it in `from_account`. Without the fallback, incoming salary would silently not raise the balance.

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/balances.test.ts`
Expected: PASS, 12 tests.

- [x] **Step 5: Commit**

```bash
git add src/domain/balances.ts tests/balances.test.ts
git commit -m "feat: derive account balances from opening balance and flows"
```

---

### Task 8: Budget progress

**Files:**
- Create: `src/domain/budgets.ts`, `tests/budgets.test.ts`

**Interfaces:**
- Consumes: `CategoryRecord`, `TransactionRecord`, `spendByCategory`.
- Produces:
  - `type BudgetLevel = "ok" | "warn" | "over"`
  - `interface BudgetProgress { category: string; currency: string; budget: number; spent: number; remaining: number; ratio: number; level: BudgetLevel }`
  - `budgetProgress(categories: CategoryRecord[], records: TransactionRecord[]): BudgetProgress[]`

- [x] **Step 1: Write the failing test `tests/budgets.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { budgetProgress } from "../src/domain/budgets.ts";
import { buildCategory } from "../src/data/records.ts";
import { makeTransaction } from "./helpers/factory.ts";

const category = (name: string, budget: unknown, currency = "EGP") =>
  buildCategory({ type: "category", name, currency, monthly_budget: budget },
    `Budget/Settings/Categories/${name}.md`);

test("progress reports spent, remaining and ratio", () => {
  const categories = [category("Groceries", 5000)];
  const records = [
    makeTransaction({ category: "Groceries", amount: 1200, transaction_type: "debit" }),
    makeTransaction({ category: "Groceries", amount: 800, transaction_type: "debit" }),
  ];
  const [progress] = budgetProgress(categories, records);
  assert.equal(progress.spent, 2000);
  assert.equal(progress.remaining, 3000);
  assert.equal(progress.ratio, 0.4);
  assert.equal(progress.level, "ok");
});

test("level turns warn at 80 percent and over past 100", () => {
  const categories = [category("Dining", 1000)];
  const at79 = budgetProgress(categories, [makeTransaction({ category: "Dining", amount: 790, transaction_type: "debit" })]);
  const at80 = budgetProgress(categories, [makeTransaction({ category: "Dining", amount: 800, transaction_type: "debit" })]);
  const at101 = budgetProgress(categories, [makeTransaction({ category: "Dining", amount: 1010, transaction_type: "debit" })]);
  assert.equal(at79[0].level, "ok");
  assert.equal(at80[0].level, "warn");
  assert.equal(at101[0].level, "over");
  assert.equal(at101[0].remaining, -10);
});

test("categories with no budget are omitted", () => {
  const categories = [category("Groceries", 5000), category("Bills", "")];
  const progress = budgetProgress(categories, []);
  assert.deepEqual(progress.map((item) => item.category), ["Groceries"]);
});

test("a zero budget is omitted rather than dividing by zero", () => {
  assert.deepEqual(budgetProgress([category("Fees", 0)], []), []);
});

test("spend is matched per currency", () => {
  const categories = [category("Groceries", 5000, "EGP")];
  const records = [
    makeTransaction({ category: "Groceries", amount: 1000, currency: "EGP", transaction_type: "debit" }),
    makeTransaction({ category: "Groceries", amount: 900, currency: "USD", transaction_type: "debit" }),
  ];
  assert.equal(budgetProgress(categories, records)[0].spent, 1000);
});

test("excluded records and income do not count against a budget", () => {
  const categories = [category("Groceries", 5000)];
  const records = [
    makeTransaction({ category: "Groceries", amount: 1000, transaction_type: "debit" }),
    makeTransaction({ category: "Groceries", amount: 4000, transaction_type: "debit", excluded: true }),
    makeTransaction({ category: "Groceries", amount: 200, transaction_type: "credit" }),
  ];
  assert.equal(budgetProgress(categories, records)[0].spent, 1000);
});

test("results are ordered most-used first", () => {
  const categories = [category("Groceries", 5000), category("Dining", 1000)];
  const records = [
    makeTransaction({ category: "Groceries", amount: 500, transaction_type: "debit" }),
    makeTransaction({ category: "Dining", amount: 900, transaction_type: "debit" }),
  ];
  assert.deepEqual(budgetProgress(categories, records).map((item) => item.category), ["Dining", "Groceries"]);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/budgets.test.ts`
Expected: FAIL — cannot find module `../src/domain/budgets.ts`.

- [x] **Step 3: Write `src/domain/budgets.ts`**

```ts
import { spendByCategory } from "./aggregate.ts";
import type { CategoryRecord, TransactionRecord } from "../data/types.ts";

export type BudgetLevel = "ok" | "warn" | "over";

export interface BudgetProgress {
  category: string;
  currency: string;
  budget: number;
  spent: number;
  remaining: number;
  /** spent / budget. Can exceed 1. */
  ratio: number;
  level: BudgetLevel;
}

const WARN_AT = 0.8;

export function budgetProgress(
  categories: CategoryRecord[],
  records: TransactionRecord[],
): BudgetProgress[] {
  const spendByCurrency = new Map<string, Map<string, number>>();

  const progress: BudgetProgress[] = [];
  for (const category of categories) {
    if (category.monthlyBudget === null || category.monthlyBudget <= 0) continue;

    if (!spendByCurrency.has(category.currency)) {
      const totals = new Map(
        spendByCategory(records, category.currency).map((item) => [item.category, item.amount]),
      );
      spendByCurrency.set(category.currency, totals);
    }

    const spent = spendByCurrency.get(category.currency)!.get(category.name) ?? 0;
    const budget = category.monthlyBudget;
    const ratio = spent / budget;
    progress.push({
      category: category.name,
      currency: category.currency,
      budget,
      spent,
      remaining: budget - spent,
      ratio,
      level: ratio > 1 ? "over" : ratio >= WARN_AT ? "warn" : "ok",
    });
  }

  return progress.sort((a, b) => b.ratio - a.ratio || a.category.localeCompare(b.category));
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/budgets.test.ts`
Expected: PASS, 7 tests.

- [x] **Step 5: Commit**

```bash
git add src/domain/budgets.ts tests/budgets.test.ts
git commit -m "feat: add budget progress calculation"
```

---

### Task 9: Exclusion rule evaluation

The engine behind *"any SMS containing 'to Ahmed Hassan' from the CIB account should be excluded"*. The precedence rule is the important part: **a rule can never override a decision made by hand.**

**Files:**
- Create: `src/domain/exclusion.ts`, `tests/exclusion.test.ts`

**Interfaces:**
- Consumes: `TransactionRecord`, `ExcludeSource`.
- Produces:
  - `type RuleField`, `type RuleOp`, `interface RuleCondition`, `interface ExclusionRule`
  - `interface ExclusionChange { excluded: boolean; exclude_reason: string; exclude_source: ExcludeSource; exclude_rule_id: string }`
  - `matchesRule(record: TransactionRecord, rule: ExclusionRule): boolean`
  - `firstMatchingRule(record: TransactionRecord, rules: ExclusionRule[]): ExclusionRule | null`
  - `resolveExclusion(record: TransactionRecord, rules: ExclusionRule[]): ExclusionChange | null` — `null` means leave the note alone
  - `validateRule(rule: unknown): string[]`
  - `RULE_FIELDS`, `RULE_OPS` — const arrays the rules editor builds its dropdowns from

- [ ] **Step 1: Write the failing test `tests/exclusion.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { matchesRule, firstMatchingRule, resolveExclusion, validateRule } from "../src/domain/exclusion.ts";
import type { ExclusionRule } from "../src/domain/exclusion.ts";
import { makeTransaction } from "./helpers/factory.ts";

const rule = (overrides: Partial<ExclusionRule> = {}): ExclusionRule => ({
  id: "self-transfer-ahmed",
  name: "Transfer to my own account",
  enabled: true,
  reason: "Transfer between my own accounts",
  match: "all",
  conditions: [
    { field: "sms_message", op: "contains", value: "Ahmed Hassan" },
    { field: "from_account", op: "equals", value: "CIB" },
  ],
  ...overrides,
});

test("the motivating rule matches", () => {
  const record = makeTransaction({
    sms_message: "EGP 2000 transferred to Ahmed Hassan from your account",
    from_account: "CIB",
  });
  assert.equal(matchesRule(record, rule()), true);
});

test("match all requires every condition", () => {
  const record = makeTransaction({
    sms_message: "EGP 2000 transferred to Ahmed Hassan", from_account: "Cash",
  });
  assert.equal(matchesRule(record, rule()), false);
});

test("match any requires only one condition", () => {
  const record = makeTransaction({ sms_message: "nothing relevant", from_account: "CIB" });
  assert.equal(matchesRule(record, rule({ match: "any" })), true);
});

test("text comparison is case-insensitive", () => {
  const record = makeTransaction({ sms_message: "transferred to AHMED HASSAN", from_account: "cib" });
  assert.equal(matchesRule(record, rule()), true);
});

test("contains matches Arabic text", () => {
  const record = makeTransaction({ sms_message: "تم تحويل مبلغ 2000 جم الى احمد حسن" });
  const arabic = rule({ conditions: [{ field: "sms_message", op: "contains", value: "احمد حسن" }] });
  assert.equal(matchesRule(record, arabic), true);
});

test("every text operator behaves", () => {
  const record = makeTransaction({ merchant: "Carrefour Maadi" });
  const check = (op: string, value: string) =>
    matchesRule(record, rule({ match: "all", conditions: [{ field: "merchant", op: op as never, value }] }));

  assert.equal(check("contains", "maadi"), true);
  assert.equal(check("not_contains", "zamalek"), true);
  assert.equal(check("equals", "Carrefour Maadi"), true);
  assert.equal(check("equals", "Carrefour"), false);
  assert.equal(check("not_equals", "Carrefour"), true);
  assert.equal(check("starts_with", "carre"), true);
  assert.equal(check("ends_with", "maadi"), true);
  assert.equal(check("matches", "^Carrefour\\s+\\w+$"), true);
});

test("numeric operators work on amount", () => {
  const record = makeTransaction({ amount: 250 });
  const check = (op: string, value: number, value2?: number) =>
    matchesRule(record, rule({ conditions: [{ field: "amount", op: op as never, value, value2 }] }));

  assert.equal(check("gt", 100), true);
  assert.equal(check("gt", 250), false);
  assert.equal(check("lt", 300), true);
  assert.equal(check("between", 200, 300), true);
  assert.equal(check("between", 300, 400), false);
});

test("a numeric operator on a record with no amount does not match", () => {
  const record = makeTransaction({ amount: "" });
  assert.equal(matchesRule(record, rule({ conditions: [{ field: "amount", op: "gt", value: 0 }] })), false);
});

test("an invalid regex never matches and never throws", () => {
  const record = makeTransaction({ merchant: "Carrefour" });
  const broken = rule({ conditions: [{ field: "merchant", op: "matches", value: "([unclosed" }] });
  assert.equal(matchesRule(record, broken), false);
});

test("a disabled rule never matches", () => {
  const record = makeTransaction({ sms_message: "to Ahmed Hassan", from_account: "CIB" });
  assert.equal(matchesRule(record, rule({ enabled: false })), false);
});

test("a rule with no conditions never matches", () => {
  assert.equal(matchesRule(makeTransaction(), rule({ conditions: [] })), false);
});

test("firstMatchingRule returns the earliest match", () => {
  const record = makeTransaction({ merchant: "Carrefour" });
  const rules = [
    rule({ id: "a", enabled: false, conditions: [{ field: "merchant", op: "contains", value: "carre" }] }),
    rule({ id: "b", conditions: [{ field: "merchant", op: "contains", value: "carre" }] }),
    rule({ id: "c", conditions: [{ field: "merchant", op: "contains", value: "four" }] }),
  ];
  assert.equal(firstMatchingRule(record, rules)!.id, "b");
});

test("resolveExclusion excludes a matching record that is not yet excluded", () => {
  const record = makeTransaction({ sms_message: "to Ahmed Hassan", from_account: "CIB" });
  assert.deepEqual(resolveExclusion(record, [rule()]), {
    excluded: true,
    exclude_reason: "Transfer between my own accounts",
    exclude_source: "rule",
    exclude_rule_id: "self-transfer-ahmed",
  });
});

test("resolveExclusion returns null when nothing needs to change", () => {
  const clean = makeTransaction({ merchant: "Carrefour" });
  assert.equal(resolveExclusion(clean, [rule()]), null);

  const alreadyExcluded = makeTransaction({
    sms_message: "to Ahmed Hassan", from_account: "CIB",
    excluded: true, exclude_source: "rule", exclude_rule_id: "self-transfer-ahmed",
    exclude_reason: "Transfer between my own accounts",
  });
  assert.equal(resolveExclusion(alreadyExcluded, [rule()]), null);
});

test("resolveExclusion clears a rule exclusion when the rule stops matching", () => {
  const record = makeTransaction({
    merchant: "Carrefour", excluded: true, exclude_source: "rule",
    exclude_rule_id: "self-transfer-ahmed", exclude_reason: "Transfer between my own accounts",
  });
  assert.deepEqual(resolveExclusion(record, [rule()]), {
    excluded: false, exclude_reason: "", exclude_source: null, exclude_rule_id: "",
  });
});

test("resolveExclusion clears a rule exclusion when the rule is deleted entirely", () => {
  const record = makeTransaction({
    excluded: true, exclude_source: "rule", exclude_rule_id: "gone", exclude_reason: "whatever",
  });
  assert.deepEqual(resolveExclusion(record, []), {
    excluded: false, exclude_reason: "", exclude_source: null, exclude_rule_id: "",
  });
});

test("a manual exclusion is never touched by any rule", () => {
  const excludedByHand = makeTransaction({
    merchant: "Carrefour", excluded: true, exclude_source: "manual", exclude_reason: "Never happened",
  });
  assert.equal(resolveExclusion(excludedByHand, [rule()]), null);
  assert.equal(resolveExclusion(excludedByHand, []), null);
});

test("a rule does not re-exclude a record a rule already excluded under a different rule id", () => {
  const record = makeTransaction({
    sms_message: "to Ahmed Hassan", from_account: "CIB",
    excluded: true, exclude_source: "rule", exclude_rule_id: "older-rule", exclude_reason: "old reason",
  });
  assert.deepEqual(resolveExclusion(record, [rule()]), {
    excluded: true,
    exclude_reason: "Transfer between my own accounts",
    exclude_source: "rule",
    exclude_rule_id: "self-transfer-ahmed",
  });
});

test("validateRule reports every problem it finds", () => {
  assert.deepEqual(validateRule(rule()), []);
  assert.ok(validateRule({ ...rule(), id: "" }).some((message) => message.includes("id")));
  assert.ok(validateRule({ ...rule(), name: "" }).some((message) => message.includes("name")));
  assert.ok(validateRule({ ...rule(), conditions: [] }).some((message) => message.includes("condition")));
  assert.ok(
    validateRule({ ...rule(), conditions: [{ field: "nope", op: "contains", value: "x" }] })
      .some((message) => message.includes("field")),
  );
  assert.ok(
    validateRule({ ...rule(), conditions: [{ field: "merchant", op: "nope", value: "x" }] })
      .some((message) => message.includes("operator")),
  );
  assert.ok(
    validateRule({ ...rule(), conditions: [{ field: "merchant", op: "matches", value: "([bad" }] })
      .some((message) => message.includes("regular expression")),
  );
  assert.ok(
    validateRule({ ...rule(), conditions: [{ field: "amount", op: "between", value: 100 }] })
      .some((message) => message.includes("two values")),
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/exclusion.test.ts`
Expected: FAIL — cannot find module `../src/domain/exclusion.ts`.

- [ ] **Step 3: Write `src/domain/exclusion.ts`**

```ts
import type { ExcludeSource, TransactionRecord } from "../data/types.ts";

export const RULE_FIELDS = [
  "sms_message", "merchant", "from_account", "to_account",
  "category", "transaction_type", "amount", "timestamp",
] as const;
export type RuleField = (typeof RULE_FIELDS)[number];

export const RULE_OPS = [
  "contains", "not_contains", "equals", "not_equals",
  "starts_with", "ends_with", "matches", "gt", "lt", "between",
] as const;
export type RuleOp = (typeof RULE_OPS)[number];

const NUMERIC_OPS: ReadonlySet<string> = new Set(["gt", "lt", "between"]);

export interface RuleCondition {
  field: RuleField;
  op: RuleOp;
  value: string | number;
  /** Only used by `between`. */
  value2?: string | number;
}

export interface ExclusionRule {
  id: string;
  name: string;
  enabled: boolean;
  reason: string;
  match: "all" | "any";
  conditions: RuleCondition[];
}

export interface ExclusionChange {
  excluded: boolean;
  exclude_reason: string;
  exclude_source: ExcludeSource;
  exclude_rule_id: string;
}

function textOf(record: TransactionRecord, field: RuleField): string {
  switch (field) {
    case "sms_message": return record.smsMessage;
    case "merchant": return record.merchant;
    case "from_account": return record.fromAccount;
    case "to_account": return record.toAccount;
    case "category": return record.category;
    case "transaction_type": return record.type;
    case "timestamp": return record.timestamp;
    case "amount": return record.amount === null ? "" : String(record.amount);
  }
}

function numberOf(record: TransactionRecord, field: RuleField): number | null {
  if (field === "amount") return record.amount;
  const parsed = Number(textOf(record, field));
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesCondition(record: TransactionRecord, condition: RuleCondition): boolean {
  if (NUMERIC_OPS.has(condition.op)) {
    const actual = numberOf(record, condition.field);
    if (actual === null) return false;
    const first = Number(condition.value);
    if (!Number.isFinite(first)) return false;
    if (condition.op === "gt") return actual > first;
    if (condition.op === "lt") return actual < first;
    const second = Number(condition.value2);
    if (!Number.isFinite(second)) return false;
    const low = Math.min(first, second);
    const high = Math.max(first, second);
    return actual >= low && actual <= high;
  }

  const actual = textOf(record, condition.field).toLowerCase();
  const expected = String(condition.value ?? "").trim().toLowerCase();

  switch (condition.op) {
    case "contains": return actual.includes(expected);
    case "not_contains": return !actual.includes(expected);
    case "equals": return actual === expected;
    case "not_equals": return actual !== expected;
    case "starts_with": return actual.startsWith(expected);
    case "ends_with": return actual.endsWith(expected);
    case "matches":
      try {
        // A broken pattern must never take down a render or a processing run.
        return new RegExp(String(condition.value), "iu").test(textOf(record, condition.field));
      } catch {
        return false;
      }
    default: return false;
  }
}

export function matchesRule(record: TransactionRecord, rule: ExclusionRule): boolean {
  if (!rule.enabled) return false;
  if (!rule.conditions.length) return false;
  return rule.match === "any"
    ? rule.conditions.some((condition) => matchesCondition(record, condition))
    : rule.conditions.every((condition) => matchesCondition(record, condition));
}

export function firstMatchingRule(
  record: TransactionRecord,
  rules: ExclusionRule[],
): ExclusionRule | null {
  return rules.find((rule) => matchesRule(record, rule)) ?? null;
}

const CLEARED: ExclusionChange = {
  excluded: false, exclude_reason: "", exclude_source: null, exclude_rule_id: "",
};

/**
 * Returns the frontmatter change a note needs, or null when it already agrees
 * with the rules. A manual exclusion is never modified — that is the property
 * that makes rules safe to edit and re-apply.
 */
export function resolveExclusion(
  record: TransactionRecord,
  rules: ExclusionRule[],
): ExclusionChange | null {
  if (record.excluded && record.excludeSource === "manual") return null;

  const rule = firstMatchingRule(record, rules);

  if (!rule) {
    if (record.excluded && record.excludeSource === "rule") return CLEARED;
    return null;
  }

  const desired: ExclusionChange = {
    excluded: true,
    exclude_reason: rule.reason || rule.name,
    exclude_source: "rule",
    exclude_rule_id: rule.id,
  };

  const unchanged =
    record.excluded &&
    record.excludeSource === "rule" &&
    record.excludeRuleId === desired.exclude_rule_id &&
    record.excludeReason === desired.exclude_reason;

  return unchanged ? null : desired;
}

export function validateRule(rule: unknown): string[] {
  const errors: string[] = [];
  const candidate = rule as Partial<ExclusionRule>;

  if (!candidate || typeof candidate !== "object") return ["Rule must be an object."];
  if (!String(candidate.id ?? "").trim()) errors.push("Rule needs an id.");
  if (!String(candidate.name ?? "").trim()) errors.push("Rule needs a name.");
  if (candidate.match !== "all" && candidate.match !== "any") {
    errors.push("Rule match must be 'all' or 'any'.");
  }

  const conditions = Array.isArray(candidate.conditions) ? candidate.conditions : [];
  if (!conditions.length) errors.push("Rule needs at least one condition.");

  conditions.forEach((condition, position) => {
    const where = `Condition ${position + 1}`;
    if (!RULE_FIELDS.includes(condition?.field as RuleField)) {
      errors.push(`${where} has an unknown field.`);
      return;
    }
    if (!RULE_OPS.includes(condition?.op as RuleOp)) {
      errors.push(`${where} has an unknown operator.`);
      return;
    }
    if (condition.op === "matches") {
      try {
        new RegExp(String(condition.value), "iu");
      } catch (error) {
        errors.push(`${where} is not a valid regular expression: ${(error as Error).message}`);
      }
    }
    if (condition.op === "between" && !Number.isFinite(Number(condition.value2))) {
      errors.push(`${where} needs two values.`);
    }
    if (NUMERIC_OPS.has(condition.op) && !Number.isFinite(Number(condition.value))) {
      errors.push(`${where} needs a number.`);
    }
    if (!NUMERIC_OPS.has(condition.op) && !String(condition.value ?? "").trim()) {
      errors.push(`${where} needs a value.`);
    }
  });

  return errors;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/exclusion.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/exclusion.ts tests/exclusion.test.ts
git commit -m "feat: add exclusion rule engine with manual-wins precedence"
```

---

### Task 10: Port the SMS parser and categoriser

Moves the existing parsing logic out of `main.js` into pure, typed, tested modules. **Behaviour must not change** — this is a move, not a rewrite.

**Files:**
- Create: `src/domain/parser/patterns.ts`, `src/domain/parser/sms.ts`, `src/domain/categorize.ts`, `tests/parser.test.ts`
- Read for reference: the pre-migration `main.js` at `git show HEAD:main.js` — functions `makeRegex`, `extractByPatterns`, `hasKeyword`, `normalizeCurrency`, `stableId`, `accountCandidates`, `parseTransactionSms`

**Interfaces:**
- Consumes: `TransactionType`.
- Produces:
  - `interface SmsPatterns { credit_keywords; debit_keywords; transfer_keywords; fee_keywords; amount_patterns; card_ending_patterns; merchant_patterns }` (all `string[]`)
  - `interface AccountConfig { accounts: Array<{ name: string; currency?: string; card_endings?: string[]; aliases?: string[] }> }`
  - `interface CategoryRules { rules: Array<{ category: string; keywords: string[] }> }`
  - `interface ParsedSms { amount: number | null; currency: string; from_account: string; to_account: string; category: string; merchant: string; transaction_type: TransactionType; status: "parsed" | "needs_review"; parser_confidence: number; transaction_id: string }`
  - `parseSms(sms: string, timestamp: string, config: { default_currency?: string }, patterns: SmsPatterns, accounts: AccountConfig, categories: CategoryRules): ParsedSms`
  - `extractTimestamp(sms: string, patterns: SmsPatterns): string | null` — **additive**, the one thing in this task that is not a straight port. `SmsPatterns` gains an optional `date_patterns?: string[]`, read through the same `makeRegex` translation as every other pattern, with named groups `year`, `month`, `day`, and optional `hour`, `minute`, `second`. It returns a Cairo-offset ISO string (`YYYY-MM-DDTHH:mm:ss+03:00`, missing time parts as `00`) or `null` when nothing matches. `parseSms` does not call it and its behaviour is unchanged; the capture path in Task 13 does. A vault with no `date_patterns` key behaves exactly as today.
  - `categorize(text: string, rules: CategoryRules): string`
  - `stableId(text: string): string`
  - `normalizeCurrency(value: string, fallback: string): string`

- [ ] **Step 1: Read the original implementation**

Run: `git show HEAD:main.js | sed -n '1,60p;356,440p'`

Copy the logic verbatim. The regex translation in `makeRegex` (Python `(?P<name>)` → JavaScript `(?<name>)`, stripping a leading `(?i)`) exists because `Settings/sms_patterns.json` still uses Python-flavoured patterns. That file is user-editable and must keep working unchanged.

- [ ] **Step 2: Write the failing test `tests/parser.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { parseSms, stableId, normalizeCurrency } from "../src/domain/parser/sms.ts";
import { categorize } from "../src/domain/categorize.ts";
import type { SmsPatterns, AccountConfig, CategoryRules } from "../src/domain/parser/sms.ts";

const PATTERNS: SmsPatterns = {
  credit_keywords: ["credited", "received", "تم اضافة"],
  debit_keywords: ["purchase", "debited", "تم خصم"],
  transfer_keywords: ["transfer", "transferred", "تحويل"],
  fee_keywords: ["fee", "commission", "رسوم"],
  amount_patterns: [
    "(?i)(?:amount|amt|مبلغ)\\s*[:=-]?\\s*(?:(?P<currency1>EGP|USD|ج\\.?م)\\s*)?(?P<amount>[0-9][0-9,]*(?:\\.[0-9]{1,2})?)(?:\\s*(?P<currency2>EGP|USD|ج\\.?م))?",
    "(?i)(?P<currency1>EGP|USD|ج\\.?م)\\s*(?P<amount>[0-9][0-9,]*(?:\\.[0-9]{1,2})?)",
    "(?i)(?P<amount>[0-9][0-9,]*(?:\\.[0-9]{1,2})?)\\s*(?P<currency2>EGP|USD|ج\\.?م)",
  ],
  card_ending_patterns: ["(?i)(?:card|acct|account|ending|xx+|\\*+)\\s*(?:no\\.?|number)?\\s*[:#-]?\\s*(?P<ending>[0-9]{4})\\b"],
  merchant_patterns: ["(?i)(?:at|merchant)\\s+([A-Za-z0-9][A-Za-z0-9 .&'/_-]{1,50}?)(?=\\s+(?:on|using|with|balance|ref)\\b|[.;,]|$)"],
};

const ACCOUNTS: AccountConfig = {
  accounts: [
    { name: "CIB", currency: "EGP", card_endings: ["0774"], aliases: ["cib"] },
    { name: "Cash", currency: "EGP", card_endings: [], aliases: ["cash"] },
  ],
};

const CATEGORIES: CategoryRules = {
  rules: [
    { category: "Groceries", keywords: ["carrefour", "supermarket"] },
    { category: "Income", keywords: ["salary", "راتب"] },
    { category: "Transfer", keywords: ["transfer", "تحويل"] },
  ],
};

const parse = (sms: string) =>
  parseSms(sms, "2026-09-05T12:00:00+03:00", { default_currency: "EGP" }, PATTERNS, ACCOUNTS, CATEGORIES);

test("parses an English debit SMS end to end", () => {
  const result = parse("Card 0774 purchase amount EGP 1,420.50 at Carrefour on 05/09");
  assert.equal(result.amount, 1420.5);
  assert.equal(result.currency, "EGP");
  assert.equal(result.transaction_type, "debit");
  assert.equal(result.from_account, "CIB");
  assert.equal(result.to_account, "");
  assert.equal(result.merchant, "Carrefour");
  assert.equal(result.category, "Groceries");
  assert.equal(result.status, "parsed");
});

test("parses an Arabic debit SMS", () => {
  const result = parse("تم خصم مبلغ 250 جم من بطاقة 0774");
  assert.equal(result.amount, 250);
  assert.equal(result.currency, "EGP");
  assert.equal(result.transaction_type, "debit");
});

test("a credit lands in to_account", () => {
  const result = parse("Your account 0774 has been credited with EGP 9,000 salary");
  assert.equal(result.transaction_type, "credit");
  assert.equal(result.to_account, "CIB");
  assert.equal(result.from_account, "");
  assert.equal(result.category, "Income");
});

test("a fee is categorised as Fees regardless of keywords", () => {
  const result = parse("A fee of EGP 25 was debited from account 0774");
  assert.equal(result.transaction_type, "fee");
  assert.equal(result.category, "Fees");
});

test("an unrecognised card ending becomes a placeholder account", () => {
  const result = parse("Card 9999 purchase amount EGP 100 at Somewhere");
  assert.equal(result.from_account, "Card ••••9999");
});

test("an unparseable SMS is marked needs_review with low confidence", () => {
  const result = parse("Your statement is ready");
  assert.equal(result.status, "needs_review");
  assert.equal(result.amount, null);
  assert.ok(result.parser_confidence < 0.5);
});

test("transaction_id is stable for the same SMS and timestamp", () => {
  const first = parse("Card 0774 purchase amount EGP 100 at Carrefour");
  const second = parse("Card 0774 purchase amount EGP 100 at Carrefour");
  assert.equal(first.transaction_id, second.transaction_id);
  assert.notEqual(first.transaction_id, parse("Card 0774 purchase amount EGP 101 at Carrefour").transaction_id);
});

test("normalizeCurrency folds the Arabic pound to EGP", () => {
  assert.equal(normalizeCurrency("جم", "EGP"), "EGP");
  assert.equal(normalizeCurrency("ج.م", "EGP"), "EGP");
  assert.equal(normalizeCurrency("usd", "EGP"), "USD");
  assert.equal(normalizeCurrency("", "EGP"), "EGP");
});

test("stableId is deterministic and 16 hex characters", () => {
  assert.equal(stableId("hello"), stableId("hello"));
  assert.match(stableId("hello"), /^[0-9a-f]{16}$/);
  assert.notEqual(stableId("hello"), stableId("hellp"));
});

test("categorize falls back to Uncategorized", () => {
  assert.equal(categorize("bought something at carrefour", CATEGORIES), "Groceries");
  assert.equal(categorize("مرتب الشهر راتب", CATEGORIES), "Income");
  assert.equal(categorize("completely unrelated text", CATEGORIES), "Uncategorized");
});

test("a broken pattern in sms_patterns.json throws a named error", () => {
  const broken: SmsPatterns = { ...PATTERNS, amount_patterns: ["(?P<amount>[unclosed"] };
  assert.throws(
    () => parseSms("anything", "2026-09-05T12:00:00+03:00", {}, broken, ACCOUNTS, CATEGORIES),
    /Invalid SMS pattern/,
  );
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tests/parser.test.ts`
Expected: FAIL — cannot find module `../src/domain/parser/sms.ts`.

- [ ] **Step 4: Write `src/domain/categorize.ts`**

```ts
export interface CategoryRules {
  rules: Array<{ category: string; keywords: string[] }>;
}

export function categorize(text: string, rules: CategoryRules): string {
  const folded = String(text ?? "").toLocaleLowerCase();
  for (const rule of rules.rules ?? []) {
    const keywords = rule.keywords ?? [];
    if (keywords.some((word) => folded.includes(String(word).toLocaleLowerCase()))) {
      return rule.category || "Uncategorized";
    }
  }
  return "Uncategorized";
}
```

- [ ] **Step 5: Write `src/domain/parser/patterns.ts`**

```ts
/**
 * Settings/sms_patterns.json uses Python-flavoured regular expressions, because
 * the original processor was Python. That file is user-editable, so the
 * translation stays rather than migrating the file.
 */
export function makeRegex(pattern: string): RegExp {
  const translated = pattern
    .replace(/^\(\?i\)/, "")
    .replace(/\(\?P<([A-Za-z_][A-Za-z0-9_]*)>/g, "(?<$1>");
  return new RegExp(translated, "iu");
}

export function extractByPatterns(text: string, patterns: string[] | undefined): RegExpMatchArray | null {
  for (const pattern of patterns ?? []) {
    let regex: RegExp;
    try {
      regex = makeRegex(pattern);
    } catch (error) {
      throw new Error(`Invalid SMS pattern ${pattern}: ${(error as Error).message}`);
    }
    const match = text.match(regex);
    if (match) return match;
  }
  return null;
}

export function hasKeyword(text: string, keywords: string[] | undefined): boolean {
  const folded = text.toLocaleLowerCase();
  return (keywords ?? []).some((word) => folded.includes(String(word).toLocaleLowerCase()));
}
```

- [ ] **Step 6: Write `src/domain/parser/sms.ts`**

```ts
import { extractByPatterns, hasKeyword } from "./patterns.ts";
import { categorize, type CategoryRules } from "../categorize.ts";
import type { TransactionType } from "../../data/types.ts";

export type { CategoryRules };

export interface SmsPatterns {
  credit_keywords?: string[];
  debit_keywords?: string[];
  transfer_keywords?: string[];
  fee_keywords?: string[];
  amount_patterns?: string[];
  card_ending_patterns?: string[];
  merchant_patterns?: string[];
}

export interface AccountConfig {
  accounts: Array<{ name: string; currency?: string; card_endings?: string[]; aliases?: string[] }>;
}

export interface ParsedSms {
  amount: number | null;
  currency: string;
  from_account: string;
  to_account: string;
  category: string;
  merchant: string;
  transaction_type: TransactionType;
  status: "parsed" | "needs_review";
  parser_confidence: number;
  transaction_id: string;
}

export function normalizeCurrency(value: string, fallback: string): string {
  if (!value) return fallback || "";
  const clean = String(value).toUpperCase().replaceAll(" ", "").replaceAll(".", "");
  return clean === "جم" || clean === "جـم" ? "EGP" : clean;
}

/** 64-bit FNV-ish hash, rendered as 16 hex characters. Stable across platforms. */
export function stableId(text: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return first.toString(16).padStart(8, "0") + second.toString(16).padStart(8, "0");
}

export function accountCandidates(sms: string, ending: string, accounts: AccountConfig): string[] {
  const folded = sms.toLocaleLowerCase();
  const found: string[] = [];
  for (const account of accounts.accounts ?? []) {
    const name = String(account.name ?? "").trim();
    const endings = (account.card_endings ?? []).map(String);
    const aliases = [name, ...(account.aliases ?? [])];
    const matchesAlias = aliases.some((alias) => {
      const clean = String(alias).trim().toLocaleLowerCase();
      return clean.length >= 3 && folded.includes(clean);
    });
    if (name && ((ending && endings.includes(ending)) || matchesAlias) && !found.includes(name)) {
      found.push(name);
    }
  }
  if (!found.length && ending) found.push(`Card ••••${ending}`);
  return found;
}

export function parseSms(
  sms: string,
  timestamp: string,
  config: { default_currency?: string },
  patterns: SmsPatterns,
  accounts: AccountConfig,
  categories: CategoryRules,
): ParsedSms {
  const amountMatch = extractByPatterns(sms, patterns.amount_patterns);
  const amountText = amountMatch?.groups?.amount?.replaceAll(",", "");
  const amount = amountText && Number.isFinite(Number(amountText)) ? Number(amountText) : null;
  const currencyText = amountMatch?.groups?.currency1 || amountMatch?.groups?.currency2 || "";
  const currency = normalizeCurrency(
    currencyText,
    amount !== null ? (config.default_currency ?? "EGP") : "",
  );

  const endingMatch = extractByPatterns(sms, patterns.card_ending_patterns);
  const ending = endingMatch?.groups?.ending ?? "";
  const candidates = accountCandidates(sms, ending, accounts);
  const merchant = extractByPatterns(sms, patterns.merchant_patterns)?.[1]?.trim() ?? "";

  const isTransfer = hasKeyword(sms, patterns.transfer_keywords);
  const isFee = hasKeyword(sms, patterns.fee_keywords);
  const isCredit = hasKeyword(sms, patterns.credit_keywords);
  const isDebit = hasKeyword(sms, patterns.debit_keywords);

  let transactionType: TransactionType = "";
  if (isTransfer) transactionType = "transfer";
  else if (isFee && !isCredit) transactionType = "fee";
  else if (isCredit && !isDebit) transactionType = "credit";
  else if (isDebit && !isCredit) transactionType = "debit";

  let fromAccount = "";
  let toAccount = "";
  if (transactionType === "debit" || transactionType === "fee") fromAccount = candidates[0] ?? "";
  else if (transactionType === "credit") toAccount = candidates[0] ?? "";
  else if (transactionType === "transfer") {
    fromAccount = candidates[0] ?? "";
    toAccount = candidates[1] ?? "";
  }

  let category = categorize(`${sms}\n${merchant}`, categories);
  if (transactionType === "fee") category = "Fees";
  else if (transactionType === "transfer" && category === "Uncategorized") category = "Transfer";

  const checks = [amount !== null, Boolean(currency), Boolean(transactionType), candidates.length > 0];
  if (category !== "Uncategorized") checks.push(true);
  const confidence =
    Math.round((checks.filter(Boolean).length / checks.length) * 100) / 100;
  const complete = amount !== null && Boolean(currency) && Boolean(transactionType) && Boolean(fromAccount || toAccount);
  const fingerprint = `${sms.trim().toLocaleLowerCase().replace(/\s+/g, " ")}|${timestamp}`;

  return {
    amount,
    currency,
    from_account: fromAccount,
    to_account: toAccount,
    category,
    merchant,
    transaction_type: transactionType,
    status: complete ? "parsed" : "needs_review",
    parser_confidence: confidence,
    transaction_id: stableId(fingerprint),
  };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test tests/parser.test.ts`
Expected: PASS, 11 tests.

- [x] **Step 8: Commit**

```bash
git add src/domain/parser/ src/domain/categorize.ts tests/parser.test.ts
git commit -m "refactor: port SMS parser and categoriser to typed pure modules"
```

---

### Task 11: Vault JSON and note writing

The first modules in this plan that touch the Obsidian API. They are thin on purpose: every decision they act on was already made by a pure function.

**Files:**
- Create: `src/data/vault-json.ts`, `src/data/write.ts`

**Interfaces:**
- Consumes: `App`, `TFile`, `TFolder`, `normalizePath` from `obsidian`; `ExclusionRule`; `validateRule`.
- Produces:
  - `loadVaultJson<T>(app: App, path: string, fallback: T): Promise<T>`
  - `saveVaultJson(app: App, path: string, value: unknown): Promise<void>`
  - `loadRules(app: App): Promise<{ rules: ExclusionRule[]; error: string | null }>`
  - `saveRules(app: App, rules: ExclusionRule[]): Promise<void>`
  - `ensureFolder(app: App, path: string): Promise<void>`
  - `updateTransaction(app: App, path: string, changes: Record<string, unknown>): Promise<void>`
  - `setExcluded(app: App, path: string, excluded: boolean, reason: string, source: "manual" | "rule", ruleId?: string): Promise<void>`
  - `setCategory(app: App, path: string, category: string): Promise<void>`
  - `updateCategoryNote(app: App, path: string, changes: { color?: string; icon?: string; monthly_budget?: number | null }): Promise<void>`

- [ ] **Step 1: Write `src/data/vault-json.ts`**

```ts
import { App, TFile, TFolder, normalizePath } from "obsidian";
import { RULES_PATH } from "../constants.ts";
import { validateRule, type ExclusionRule } from "../domain/exclusion.ts";

export async function ensureFolder(app: App, path: string): Promise<void> {
  const normalized = normalizePath(path);
  if (!normalized || normalized === "/") return;
  let current = "";
  for (const part of normalized.split("/")) {
    current = current ? `${current}/${part}` : part;
    const existing = app.vault.getAbstractFileByPath(current);
    if (!existing) await app.vault.createFolder(current);
    else if (!(existing instanceof TFolder)) throw new Error(`${current} exists but is not a folder.`);
  }
}

export async function loadVaultJson<T>(app: App, path: string, fallback: T): Promise<T> {
  const file = app.vault.getAbstractFileByPath(normalizePath(path));
  if (!(file instanceof TFile)) return fallback;
  try {
    return JSON.parse(await app.vault.cachedRead(file)) as T;
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${(error as Error).message}`);
  }
}

export async function saveVaultJson(app: App, path: string, value: unknown): Promise<void> {
  const normalized = normalizePath(path);
  const slash = normalized.lastIndexOf("/");
  if (slash > 0) await ensureFolder(app, normalized.slice(0, slash));
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const existing = app.vault.getAbstractFileByPath(normalized);
  if (existing instanceof TFile) await app.vault.process(existing, () => content);
  else if (existing) throw new Error(`${normalized} exists but is not a file.`);
  else await app.vault.create(normalized, content);
}

/**
 * Never throws. A malformed rules file yields zero rules plus an error message,
 * so the UI can offer a repair instead of the plugin failing to load.
 */
export async function loadRules(app: App): Promise<{ rules: ExclusionRule[]; error: string | null }> {
  try {
    const data = await loadVaultJson<{ rules?: unknown }>(app, RULES_PATH, { rules: [] });
    const candidates = Array.isArray(data.rules) ? data.rules : [];
    const rules: ExclusionRule[] = [];
    const problems: string[] = [];
    for (const candidate of candidates) {
      const errors = validateRule(candidate);
      if (errors.length) problems.push(`${(candidate as ExclusionRule)?.id ?? "?"}: ${errors.join(" ")}`);
      else rules.push(candidate as ExclusionRule);
    }
    return { rules, error: problems.length ? problems.join("\n") : null };
  } catch (error) {
    return { rules: [], error: (error as Error).message };
  }
}

export async function saveRules(app: App, rules: ExclusionRule[]): Promise<void> {
  await saveVaultJson(app, RULES_PATH, { rules });
}
```

- [ ] **Step 2: Write `src/data/write.ts`**

```ts
import { App, TFile, normalizePath } from "obsidian";

/**
 * Every mutation funnels through processFrontMatter, which rewrites only the
 * frontmatter block. The vault syncs to iPhone, so a whole-file write could
 * discard a concurrent edit to the note body.
 */
async function editFrontMatter(
  app: App,
  path: string,
  edit: (frontmatter: Record<string, unknown>) => void,
): Promise<void> {
  const file = app.vault.getAbstractFileByPath(normalizePath(path));
  if (!(file instanceof TFile)) throw new Error(`${path} is not a file.`);
  await app.fileManager.processFrontMatter(file, edit);
}

export async function updateTransaction(
  app: App,
  path: string,
  changes: Record<string, unknown>,
): Promise<void> {
  await editFrontMatter(app, path, (frontmatter) => {
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") delete frontmatter[key];
      else frontmatter[key] = value;
    }
  });
}

export async function setExcluded(
  app: App,
  path: string,
  excluded: boolean,
  reason: string,
  source: "manual" | "rule",
  ruleId = "",
): Promise<void> {
  await updateTransaction(app, path, {
    excluded: excluded ? true : null,
    exclude_reason: excluded ? reason : null,
    exclude_source: excluded ? source : null,
    exclude_rule_id: excluded && ruleId ? ruleId : null,
  });
}

export async function setCategory(app: App, path: string, category: string): Promise<void> {
  await updateTransaction(app, path, { category });
}

export async function updateCategoryNote(
  app: App,
  path: string,
  changes: { color?: string; icon?: string; monthly_budget?: number | null },
): Promise<void> {
  await editFrontMatter(app, path, (frontmatter) => {
    if (changes.color !== undefined) frontmatter.color = changes.color || null;
    if (changes.icon !== undefined) frontmatter.icon = changes.icon || null;
    if (changes.monthly_budget !== undefined) frontmatter.monthly_budget = changes.monthly_budget;
  });
}
```

Setting a field to `null` or `""` **deletes** it rather than writing an empty value, so un-excluding a transaction leaves its frontmatter as clean as it was before.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/data/vault-json.ts src/data/write.ts
git commit -m "feat: add vault JSON and frontmatter writing"
```

---

### Task 12: The transaction index

**Files:**
- Create: `src/data/index-store.ts`

**Interfaces:**
- Consumes: `App`, `TFile` from `obsidian`; `buildTransaction`, `buildAccount`, `buildCategory`, `isTransactionPath`.
- Produces:
  - `class TransactionIndex`
    - `constructor(app: App)`
    - `build(): void` — full rebuild from `metadataCache`
    - `registerEvents(plugin: Plugin): void`
    - `transactions(): TransactionRecord[]`
    - `accounts(): AccountRecord[]`
    - `categories(): CategoryRecord[]`
    - `subscribe(listener: () => void): () => void` — returns an unsubscribe function
    - `refreshPath(path: string): void`

- [ ] **Step 1: Write `src/data/index-store.ts`**

```ts
import { App, Plugin, TFile } from "obsidian";
import { ACCOUNTS_DIR, CATEGORIES_DIR } from "../constants.ts";
import { buildAccount, buildCategory, buildTransaction, isTransactionPath } from "./records.ts";
import type { AccountRecord, CategoryRecord, TransactionRecord } from "./types.ts";

/**
 * Holds every transaction, account and category in memory.
 *
 * Records are built from metadataCache, which Obsidian has already parsed, so a
 * full rebuild performs no file reads. Single-file changes update one entry
 * rather than rebuilding, which keeps typing in the search box free of I/O.
 */
export class TransactionIndex {
  private readonly app: App;
  private readonly transactionMap = new Map<string, TransactionRecord>();
  private readonly accountMap = new Map<string, AccountRecord>();
  private readonly categoryMap = new Map<string, CategoryRecord>();
  private readonly listeners = new Set<() => void>();
  private notifyHandle: number | null = null;

  constructor(app: App) {
    this.app = app;
  }

  build(): void {
    this.transactionMap.clear();
    this.accountMap.clear();
    this.categoryMap.clear();
    for (const file of this.app.vault.getMarkdownFiles()) this.ingest(file);
    this.notify();
  }

  registerEvents(plugin: Plugin): void {
    plugin.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        this.ingest(file);
        this.notify();
      }),
    );
    plugin.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.forget(file.path);
        this.notify();
      }),
    );
    plugin.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.forget(oldPath);
        if (file instanceof TFile) this.ingest(file);
        this.notify();
      }),
    );
  }

  refreshPath(path: string): void {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) this.ingest(file);
    this.notify();
  }

  private forget(path: string): void {
    this.transactionMap.delete(path);
    this.accountMap.delete(path);
    this.categoryMap.delete(path);
  }

  private ingest(file: TFile): void {
    if (file.extension !== "md") return;
    this.forget(file.path);
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) return;
    const type = String(frontmatter.type ?? "");

    if (type === "transaction" && isTransactionPath(file.path)) {
      this.transactionMap.set(file.path, buildTransaction(frontmatter, file.path));
    } else if (type === "account" && file.path.startsWith(`${ACCOUNTS_DIR}/`)) {
      this.accountMap.set(file.path, buildAccount(frontmatter, file.path));
    } else if (type === "category" && file.path.startsWith(`${CATEGORIES_DIR}/`)) {
      this.categoryMap.set(file.path, buildCategory(frontmatter, file.path));
    }
  }

  /** Coalesces bursts of vault events into one notification per frame. */
  private notify(): void {
    if (this.notifyHandle !== null) return;
    this.notifyHandle = window.setTimeout(() => {
      this.notifyHandle = null;
      for (const listener of this.listeners) listener();
    }, 50);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  transactions(): TransactionRecord[] {
    return [...this.transactionMap.values()];
  }

  accounts(): AccountRecord[] {
    return [...this.accountMap.values()];
  }

  categories(): CategoryRecord[] {
    return [...this.categoryMap.values()];
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/data/index-store.ts
git commit -m "feat: add in-memory transaction index with incremental updates"
```

---

### Task 13: Port the plugin entry point

Rebuilds `src/main.ts` from the original `main.js`, wired to the new modules. The user-visible surface must be identical: same ribbon icon, same commands, same protocol handlers, same settings.

**Files:**
- Modify: `src/main.ts`
- Create: `src/settings.ts`, `src/data/create.ts`
- Read for reference: `git show HEAD:main.js`

**Interfaces:**
- Consumes: everything from Tasks 2–12.
- Produces:
  - `createRawSmsTransaction(app, params): Promise<TFile>`
  - `createStructuredTransaction(app, params): Promise<TFile>`
  - `createManualTransaction(app, fields): Promise<TFile>` — used by Plan B's add-transaction modal
  - `plugin.processPending(): Promise<number>` — parses pending notes and applies exclusion rules
  - `plugin.applyRulesToAll(): Promise<number>`
  - `plugin.index: TransactionIndex`

- [ ] **Step 1: Write `src/data/create.ts`**

Port `transactionPathParts`, `uniqueTransactionPath`, `transactionMarkdown`, `createRawSmsTransaction`, and `createStructuredTransaction` from the original `main.js` (lines 152–280 of `git show HEAD:main.js`). Keep the path scheme and the markdown body byte-for-byte identical so existing notes and the iPhone Shortcut docs stay accurate.

Both capture links stay, and `docs/iphone-shortcuts.md` now pins down exactly what each one carries:

- `obsidian://finance-sms?message=…` — the **SMS automation**, and it sends *only* the message. No timestamp, no URL encoding, no other parameter. Everything else is read out of the message text.
- `obsidian://finance-transaction?amount=…&currency=…&account=…&type=…` — the **manual Shortcut**, run by hand, which supplies the fields from prompts and dropdowns.

Two changes to `createRawSmsTransaction` follow from the SMS link losing its encoding and its timestamp:

1. **Reassemble an unencoded message.** Obsidian splits the query string on `&`, so a message containing a literal `&` (or a `#`) arrives truncated, with the rest of the text spread across stray parameter keys. After reading `message`, append every unrecognised parameter back onto it: for each extra key, add `&` + key, and `=` + value when the value is non-empty, in the order received. Recognised keys are `message`/`sms`/`text` and `timestamp`/`date`. This is what lets the automation stay two actions long.

2. **Resolve the timestamp from the message first.** Order: the `timestamp` parameter if the caller sent one, then a date found in the SMS text via `extractTimestamp` from Task 10, then `new Date().toISOString()`. The capture time is only the last resort.

Cover both with cases in `tests/create.test.ts`: a message containing `A&B=C` round-trips whole, and a message carrying its own date produces a note path from that date rather than from now.

Add one new exported function:

```ts
export interface ManualTransactionFields {
  timestamp: string;
  amount: number;
  currency: string;
  fromAccount: string;
  toAccount: string;
  category: string;
  merchant: string;
  type: TransactionType;
  note: string;
}

export async function createManualTransaction(
  app: App,
  fields: ManualTransactionFields,
): Promise<TFile> {
  const path = await uniqueTransactionPath(app, fields.timestamp);
  const content = transactionMarkdown({
    timestamp: fields.timestamp,
    amount: fields.amount,
    currency: fields.currency,
    from_account: fields.fromAccount,
    to_account: fields.toAccount,
    category: fields.category || "Uncategorized",
    merchant: fields.merchant,
    transaction_type: fields.type,
    status: "parsed",
    source: "manual-ui",
    parser_confidence: 1,
    transaction_id: stableId(
      [fields.timestamp, fields.amount, fields.currency, fields.type,
       fields.fromAccount, fields.toAccount, fields.merchant].join("|"),
    ),
  }, "", fields.note);
  await writeVaultFile(app, path, content);
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) throw new Error(`Could not create ${path}.`);
  return file;
}
```

`transactionMarkdown` gains a third parameter `note = ""` which is written under the `## Notes` heading. Existing call sites pass nothing and are unaffected.

- [ ] **Step 2: Write `src/settings.ts`**

Port `FinanceAutomationSettingTab` from the original `main.js` verbatim, converted to TypeScript, with its two toggles ("Process when Obsidian starts", "Watch transaction notes"). Add a third:

```ts
new Setting(containerEl)
  .setName("Apply exclusion rules automatically")
  .setDesc("Run the exclusion rules whenever a transaction note is created or changed.")
  .addToggle((toggle) =>
    toggle.setValue(this.plugin.settings.applyExclusionRules).onChange(async (value) => {
      this.plugin.settings.applyExclusionRules = value;
      await this.plugin.saveSettings();
    }),
  );
```

`DEFAULT_SETTINGS` becomes:

```ts
export interface FinanceSettings {
  runOnStartup: boolean;
  watchTransactions: boolean;
  applyExclusionRules: boolean;
}

export const DEFAULT_SETTINGS: FinanceSettings = {
  runOnStartup: true,
  watchTransactions: true,
  applyExclusionRules: true,
};
```

- [ ] **Step 3: Rewrite `src/main.ts`**

Port from the original, keeping: the ribbon icon, the `process-transactions` command, both `registerObsidianProtocolHandler` calls, the running/queued guard, the status bar item, and the `ignoreWatchUntil` map that stops a frontmatter write from re-triggering its own watcher.

Remove: `generateStatsWithJavaScript`, the `refresh-statistics` and `process-and-refresh` commands, and everything that writes to `Budget/Stats/`. Those are replaced by the UI (removal of the generated files themselves happens in Plan C, Task 8 — until then the stale files simply stop being rewritten).

Add: index construction and `processPending` applying exclusion rules.

```ts
async processPending(): Promise<number> {
  const [config, patterns, accounts, categories] = await Promise.all([
    loadVaultJson(this.app, CONFIG_PATH, { default_currency: "EGP" }),
    loadVaultJson(this.app, SETTINGS_DIR + "/sms_patterns.json", {} as SmsPatterns),
    loadVaultJson(this.app, ACCOUNTS_JSON_PATH, { accounts: [] } as AccountConfig),
    loadVaultJson(this.app, CATEGORY_RULES_PATH, { rules: [] } as CategoryRules),
  ]);
  const { rules } = await loadRules(this.app);

  let updated = 0;
  for (const record of this.index.transactions()) {
    const changes: Record<string, unknown> = {};

    const needsParsing = record.status !== "parsed" && Boolean(record.smsMessage);
    if (needsParsing) {
      const parsed = parseSms(record.smsMessage, record.timestamp, config, patterns, accounts, categories);
      // The parser fills only empty fields; anything set by hand wins.
      for (const [key, value] of Object.entries(parsed)) {
        const current = (record as unknown as Record<string, unknown>)[toRecordKey(key)];
        const parserOwned = ["status", "parser_confidence", "transaction_id"].includes(key);
        const isDefault = key === "category" && current === "Uncategorized";
        if (parserOwned || isDefault || current === null || current === "" || current === undefined) {
          changes[key] = value;
        }
      }
    }

    if (this.settings.applyExclusionRules) {
      const exclusion = resolveExclusion(record, rules);
      if (exclusion) Object.assign(changes, exclusion);
    }

    if (!Object.keys(changes).length) continue;
    this.ignoreWatchUntil.set(record.path, Date.now() + 2000);
    await updateTransaction(this.app, record.path, changes);
    updated += 1;
  }
  return updated;
}
```

`toRecordKey` maps a frontmatter key to its camelCase record field. Add it to
`src/data/records.ts` and export it:

```ts
const RECORD_KEYS: Record<string, keyof TransactionRecord> = {
  amount: "amount",
  currency: "currency",
  from_account: "fromAccount",
  to_account: "toAccount",
  category: "category",
  merchant: "merchant",
  transaction_type: "type",
  status: "status",
  parser_confidence: "parserConfidence",
  transaction_id: "transactionId",
};

export function toRecordKey(frontmatterKey: string): keyof TransactionRecord | null {
  return RECORD_KEYS[frontmatterKey] ?? null;
}
```

In `processPending`, skip any key `toRecordKey` does not recognise rather than
comparing against `undefined`, which would make every unknown key look empty and
overwrite it on every pass.

Also add:

```ts
async applyRulesToAll(): Promise<number> {
  const { rules } = await loadRules(this.app);
  let updated = 0;
  for (const record of this.index.transactions()) {
    const exclusion = resolveExclusion(record, rules);
    if (!exclusion) continue;
    this.ignoreWatchUntil.set(record.path, Date.now() + 2000);
    await updateTransaction(this.app, record.path, exclusion);
    updated += 1;
  }
  return updated;
}
```

And register a command for it:

```ts
this.addCommand({
  id: "apply-exclusion-rules",
  name: "Apply exclusion rules to all transactions",
  callback: async () => {
    const updated = await this.applyRulesToAll();
    new Notice(`Finance: updated ${updated} transaction(s).`);
  },
});
```

In `onload`, build the index inside `onLayoutReady` — `metadataCache` is not fully populated before that:

```ts
this.app.workspace.onLayoutReady(() => {
  this.index.build();
  this.index.registerEvents(this);
  // … existing watcher and startup-run wiring
});
```

- [ ] **Step 4: Typecheck and build**

Run: `npm run build`
Expected: exits 0, `main.js` regenerated.

- [ ] **Step 5: Run the whole test suite**

Run: `npm test`
Expected: PASS, every test.

The old `tests/capture-links.test.js` mocks `require("obsidian")` against the CommonJS `main.js`. Since `main.js` is now a bundle, that test still loads it the same way and should still pass. If it fails because the bundle's export shape changed, update the test to read `module.exports.default` rather than `module.exports` — esbuild's CJS output puts a default export there.

- [ ] **Step 6: Verify in Obsidian by hand**

1. Run `npm run build`, then reload Obsidian (Cmd+R / "Reload app without saving").
2. Confirm Finance Automation loads with no console error.
3. Create a transaction note from `Budget/Templates/Transaction.md`, paste a real bank SMS into the Original SMS block, and save.
4. Confirm the frontmatter fills in within a couple of seconds, exactly as before.
5. Open the command palette and confirm "Process pending SMS transactions" and "Apply exclusion rules to all transactions" are both present, and that "Refresh statistics" is gone.
6. Trigger an `obsidian://finance-sms?message=...` link — message only, nothing else — and confirm the note is created at the same path shape as before, with `status: pending`, and is then parsed. Try one whose text contains `&` and confirm the whole message survives.
7. Trigger an `obsidian://finance-transaction?amount=12&currency=EGP&account=Cash&type=debit` link and confirm the note is created `status: parsed`.

- [ ] **Step 7: Commit**

```bash
git add src/ main.js manifest.json
git commit -m "refactor: rebuild plugin entry on the new data and domain layers"
```

---

### Task 14: Guard the layering and finish the plan

A test that fails the build if anything under `domain/` reaches for the Obsidian API. Without it, the boundary that makes this codebase testable erodes the first time someone needs `Notice` inside a calculation.

**Files:**
- Create: `tests/architecture.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test `tests/architecture.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await filesUnder(full)));
    else if (entry.name.endsWith(".ts")) found.push(full);
  }
  return found;
}

test("nothing under src/domain imports from obsidian", async () => {
  const offenders: string[] = [];
  for (const file of await filesUnder("src/domain")) {
    const source = await readFile(file, "utf8");
    if (/from\s+["']obsidian["']/.test(source)) offenders.push(file);
  }
  assert.deepEqual(
    offenders, [],
    "domain/ must stay pure so every money calculation is testable in Node",
  );
});

test("nothing under src/domain imports from src/ui", async () => {
  const offenders: string[] = [];
  for (const file of await filesUnder("src/domain")) {
    const source = await readFile(file, "utf8");
    if (/from\s+["'][^"']*\/ui\//.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test("the bundle declares no runtime dependencies", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  assert.deepEqual(manifest.dependencies ?? {}, {});
});
```

- [ ] **Step 2: Run the test**

Run: `node --test tests/architecture.test.ts`
Expected: PASS. If it fails, a domain module has an Obsidian import — move whatever needs it into `src/data/`.

- [ ] **Step 3: Update `README.md`**

Replace the "Obsidian automation" section's build instructions with:

```markdown
## Developing the plugin

The plugin is written in TypeScript under `Budget/obsidian-finance-automation/src/`
and bundled to a single `main.js` by esbuild. `main.js` is a build artifact — edit the
sources, never the bundle.

```bash
cd Budget/obsidian-finance-automation
npm install
npm run dev     # rebuild on change, and copy into .obsidian/plugins/finance-automation/
npm test        # unit tests for every calculation
npm run build   # typecheck, then a one-shot production bundle
```

After a build, reload Obsidian to pick up the new bundle.
```

Also delete the paragraph claiming reports are regenerated automatically, since the Stats generation is gone.

- [ ] **Step 4: Run the full suite and build one final time**

Run: `npm test && npm run build`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add tests/architecture.test.ts README.md
git commit -m "test: enforce the domain layer boundary"
```

---

## Done when

- `npm test` passes with roughly 120 assertions across 10 test files.
- `npm run build` produces a `main.js` that loads in Obsidian on desktop and iPhone.
- Capturing an SMS from the iPhone Shortcut still creates and fills a transaction note exactly as it did before this plan.
- `Budget/Stats/` is no longer written to.
- No file under `src/domain/` imports from `obsidian`.

Plan B builds the Budget view on top of this.
