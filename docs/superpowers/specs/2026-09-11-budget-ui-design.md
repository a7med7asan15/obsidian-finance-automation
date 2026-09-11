---
type: spec
status: draft
created: 2026-09-11
supersedes: none
---

# Budget UI — Design

A budget-tracker interface inside the existing **Finance Automation** Obsidian plugin.
Transactions stay one Markdown note each; the UI is a read-and-edit layer over them.

Decisions come from `docs/budget-ui-questions.md`. Question numbers are cited as `[Q7]`.

---

## 1. Goals

1. A Transactions screen with category, account, and date filters, defaulting to the
   current month and switchable to any month, any year, or all time.
2. Per-account balances so the money in each account is visible separately.
3. An exclusion flag: a transaction that did not really happen stays visible but is
   skipped by every calculation.
4. Auto-exclusion rules, editable without touching code or YAML.
5. A Stats screen.
6. A UI that looks deliberate on an iPhone, comparable to TrackNest or Wallet `[Q28]`.

### Non-goals

- Currency conversion. Every figure is reported per currency `[Q13]`.
- Planned/large-expense goal tracking; `Budget/Big/2026.md` stays a manual note `[Q25]`.
- Bulk multi-select actions `[Q21]`.
- Recurring-payment detection.
- Any network call. All processing stays local, as it is today.

---

## 2. Constraints from the existing system

- **Capture keeps both links, with a sharper split** (`docs/iphone-shortcuts.md`). The
  SMS automation posts the message text to `obsidian://finance-sms` and *nothing else* —
  no timestamp, no encoding — and the plugin derives every field from the message,
  resolving the account from the account/card number in it. The manual Shortcut, run by
  hand for cash and anything without an SMS, posts separated fields to
  `obsidian://finance-transaction`. Both handlers, the SMS parser, the category keyword
  rules, and the `YYYY/Mon/DDTHH-mm-ss.md` path scheme survive as-is; Plan A Task 13 adds
  only the unencoded-message reassembly and the message-first timestamp fallback.
- **One note per transaction.** Frontmatter is the database.
- **Mobile is the primary client.** The plugin is installed on iPhone through BRAT,
  so the build must emit a single `main.js` and must not be desktop-only.
- **The vault syncs via `github-gitless-sync` to the iPhone** `[Q30]`. Two devices can
  hold the same note. Every write goes through `fileManager.processFrontMatter`, which
  touches only the frontmatter block, so a concurrent edit to a note's body cannot be
  lost by us. We never rewrite a transaction note wholesale.
- **Volume is ~100–200 transactions/month** `[Q29]` — about 2,400/year. Small enough to
  hold every record in memory, large enough that re-reading every file on each
  keystroke is not acceptable. See §6.

---

## 3. Architecture

### 3.1 Packaging

The UI ships **inside the existing `finance-automation` plugin** `[Q1]`. One install,
one BRAT source, and the UI reuses the parser's reader instead of duplicating it.

A **TypeScript + esbuild** build is introduced `[Q2]`. Sources move to `src/`; esbuild
bundles to a single committed `main.js`, so BRAT and the iPhone install are unaffected.
The tradeoff accepted here: `main.js` becomes a build artifact and must no longer be
hand-edited.

**No UI framework** `[Q3]`. Vanilla TypeScript against the DOM, using Obsidian's own
`ItemView`, `Modal`, `Menu`, `Setting`, and `setIcon`. The reactivity needed is one
loop — filters change, recompute, re-render — which a framework would not simplify.

### 3.2 Layers

Four layers, each depending only on the one beneath it.

```
┌─────────────────────────────────────────────┐
│ ui/      views, tabs, components, charts    │  Obsidian API + DOM
├─────────────────────────────────────────────┤
│ store/   filter state, subscriptions        │  plain TS, no Obsidian
├─────────────────────────────────────────────┤
│ domain/  filter · aggregate · rules ·       │  PURE FUNCTIONS — all tests live here
│          balances · budgets                 │
├─────────────────────────────────────────────┤
│ data/    index, frontmatter read/write      │  Obsidian API
└─────────────────────────────────────────────┘
```

The rule that makes this testable: **`domain/` imports nothing from `obsidian`.** It
takes plain record arrays and returns plain results. Every calculation that can be
silently wrong about money lives there and is unit-tested in Node `[Q31]`.

### 3.3 File layout

```
src/
  main.ts                    plugin entry: view, commands, ribbon, protocol handlers
  settings.ts                plugin settings tab

  data/
    types.ts                 Transaction, Account, Category, Rule, Filter
    frontmatter.ts           read + coerce frontmatter; number/date/bool tolerance
    index.ts                 TransactionIndex — build, incremental update, subscribe
    accounts.ts              load account notes
    categories.ts            load category notes (colour, icon, budget)
    rules-io.ts              load/save exclusion_rules.json
    write.ts                 all mutations, via processFrontMatter
    create.ts                new transaction notes (shared with protocol handlers)

  domain/
    dates.ts                 period ranges, month/year arithmetic, Africa/Cairo
    filter.ts                applyFilter(records, filter) -> records
    aggregate.ts             totals, byCategory, byDay, byMerchant, byAccount
    balances.ts              derived account balances
    budgets.ts               budget vs spend per category
    exclusion.ts             evaluateRules(record, rules) -> {excluded, reason, ruleId}
    categorize.ts            existing keyword categorisation (ported)
    parser/
      sms.ts                 existing SMS parser (ported)
      patterns.ts

  store/
    filter-store.ts          current filter + listeners; persisted to plugin data

  ui/
    budget-view.ts           BudgetView (ItemView) — tab bar + shared filter bar
    tabs/
      transactions-tab.ts
      accounts-tab.ts
      stats-tab.ts
    components/
      filter-bar.ts          chips + More filters disclosure
      period-picker.ts       stepper + quick chips
      summary-strip.ts       income / expenses / net
      transaction-row.ts
      transaction-sheet.ts   detail + edit (bottom sheet on mobile, modal on desktop)
      add-transaction-modal.ts
      category-editor.ts     colour, icon, monthly budget
      rules-editor.ts        exclusion rule list + editor
      empty-state.ts
    charts/
      svg.ts                 shared primitives, axis, scale, tooltip
      donut.ts
      bars.ts
      line.ts
    format.ts                money, dates, relative time

  codeblock.ts               ```finance-summary``` embed (Phase 6)

styles.css                   single stylesheet, theme-aware
tests/                       node:test, domain/ only
```

---

## 4. Data model

### 4.1 Transaction frontmatter

Existing fields are unchanged. Four are added:

| Field | Type | Meaning |
|---|---|---|
| `excluded` | boolean | Skipped by every calculation. Still listed. |
| `exclude_reason` | string | Free text, shown on the row and in the detail sheet. |
| `exclude_source` | `manual` \| `rule` | Who set it. Protects manual decisions. |
| `exclude_rule_id` | string | Which rule, when `exclude_source: rule`. |

`excluded` is deliberately **separate from `status`** `[Q7]`. `status` answers "how well
did the parser understand this note"; `excluded` answers "does this count". Collapsing
them would mean an excluded note could never also be flagged as badly parsed.

Excluded transactions are rendered dimmed with a struck-through amount and an
`excluded` pill carrying the reason.

### 4.2 What counts

A record contributes to totals when **it has a usable numeric amount and is not
excluded** `[Q9]`. `status` does not gate the math: if money left the account, it
counts, even when the merchant name came out as garbage. Unparsed records instead
surface as a warning badge on the row and an "N transactions need review" banner above
the list, which opens the list filtered to them.

Transfers never count as income or expense `[Q14]`. They adjust both account balances
and appear in their own stats section. They remain visible in the list by default.

### 4.3 Accounts

Account notes gain two fields:

| Field | Type | Meaning |
|---|---|---|
| `opening_balance` | number | Balance as of `opening_date`. |
| `opening_date` | ISO date | Start of the derived ledger. |

**Balance is derived** `[Q12]`:

```
balance(account) = opening_balance
                 + Σ amount of non-excluded credits into it   (to_account)
                 − Σ amount of non-excluded debits/fees out of it (from_account)
                 ± transfers, applied to both sides
  … counting only transactions at or after opening_date
```

The existing `balance` and `balance_updated_at` fields are kept but demoted to a
**reference figure**: the Accounts tab shows the derived balance as the headline number
and, when a reference figure exists, the difference beneath it as "statement drift".

> **Known risk, accepted.** A derived balance is only as complete as the SMS captured.
> A missed message makes the number wrong and nothing detects it. The drift line is the
> only safeguard in v1. A statement-reconciliation checkpoint remains an available
> upgrade later and the schema is designed to accept it: `opening_balance`/`opening_date`
> generalise to a list of statement checkpoints without a migration of transaction notes.

Known accounts `[Q15]`:

```json
{"accounts": [
  {"name": "CIB",  "currency": "EGP", "account_type": "bank", "card_endings": ["0774"], "aliases": ["cib"]},
  {"name": "Cash", "currency": "EGP", "account_type": "cash", "card_endings": [],       "aliases": ["cash"]}
]}
```

### 4.4 Categories

Category notes gain `color` (hex) and `icon` (Lucide name); `monthly_budget` already
exists and becomes editable from the UI `[Q23]`. All three are written from the
category editor, so YAML never has to be edited on a phone `[Q27]`. A category with no
colour falls back to a fixed 12-colour palette keyed by a stable hash of its name, so
it is never uncoloured and never changes colour between sessions.

### 4.5 Currency

Every aggregate is keyed by currency. There is no conversion and no "total across
currencies" figure anywhere `[Q13]`. Where a screen would show a single number for
mixed currencies, it shows one row per currency instead. With only EGP in use today
this is invisible, but it keeps the aggregates honest if USD appears.

---

## 5. Exclusion rules

The requirement: *"any sms that contains to Ahmed Hassan from CIB account should be
excluded"*, and rules must be easy to change.

### 5.1 Storage

`Budget/Settings/exclusion_rules.json`:

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
        {"field": "sms_message",  "op": "contains", "value": "Ahmed Hassan"},
        {"field": "from_account", "op": "equals",   "value": "CIB"}
      ]
    }
  ]
}
```

- `match`: `all` (AND) or `any` (OR).
- `field`: `sms_message`, `merchant`, `from_account`, `to_account`, `category`,
  `transaction_type`, `amount`, `timestamp`.
- `op`: `contains`, `not_contains`, `equals`, `not_equals`, `starts_with`, `ends_with`,
  `matches` (regex), `gt`, `lt`, `between`.
- Text comparison is case-insensitive and Unicode-aware, so Arabic SMS bodies match the
  same way the existing keyword rules do.

### 5.2 Evaluation

`evaluateRules(record, rules)` is pure and returns
`{excluded, reason, ruleId} | null`. It runs:

- during processing of new transactions, and
- on demand from the Rules editor ("Apply rules to all transactions").

### 5.3 Manual decisions win

| Current state | Rule matches | Rule stops matching |
|---|---|---|
| not excluded | set `excluded: true`, `exclude_source: rule` | — |
| `exclude_source: rule` | update reason/id | clear the exclusion |
| `exclude_source: manual` | **no change** | **no change** |

A rule can never override a decision made by hand, and disabling a rule cleanly reverts
only what that rule did. This is the property that makes the rules safe to experiment
with.

### 5.4 Editor

A Rules screen lists each rule with its name, an enable toggle, a match count, and an
edit action. The editor builds conditions from dropdowns plus one value field — no JSON
editing on the phone. A live preview shows how many existing transactions the rule
matches and lists the first few, so a rule can be checked before it is saved. Saving
offers "apply to existing transactions" as an explicit action, never silently.

---

## 6. The index

Reading every transaction file on each render is too slow at a few thousand notes, and
re-reading on each keystroke of the search box is worse.

`TransactionIndex` holds every transaction as a plain record in memory:

- **Build** on `workspace.onLayoutReady`, from `metadataCache.getFileCache()`. No file
  reads — Obsidian has already parsed the frontmatter.
- **Update incrementally** on `metadataCache.on("changed")`, `vault.on("delete")`, and
  `vault.on("rename")`, replacing the single affected record.
- **Publish** changes to subscribers; the open view re-renders.
- **Derive** `date`, `month`, `year`, and a lower-cased search blob once per record at
  index time, so filtering is a scan over pre-computed fields.

A full scan of ~2,400 records per filter change is sub-millisecond, so no query index
is needed. The list renders **the first 100 rows with an incremental "show more"**,
which keeps the DOM small without a virtualisation layer.

Frontmatter is read tolerantly: amounts arrive as `1,234.50` or `1234.5`, dates with or
without an offset, booleans as `true`/`"true"`/`"yes"`. `frontmatter.ts` owns every
coercion so no other module deals with the variation.

---

## 7. UI

### 7.1 Shell

One **Budget view** (`ItemView`), opened from a ribbon icon and a command, with three
tabs — **Transactions · Accounts · Stats** — sharing one filter state `[Q4, Q5]`.
Shared state is the point: switching to Stats shows statistics for exactly the slice
just being read on the Transactions tab.

Filter state persists in plugin data, so reopening the view restores the last view —
except the period, which always reopens on the current month.

A markdown code-block embed (```` ```finance-summary ```` ) is **Phase 6**, after the
app works `[Q4: C]`.

### 7.2 Period picker `[Q17]`

A stepper is primary: `‹  September 2026  ›`. Tapping the label opens a unit menu —
Month, Year, All time, Custom range. Underneath sit quick chips: **This month · Last
month · This year · All**. Stepping back one month is the most frequent action in the
whole UI and costs one tap.

### 7.3 Filter bar `[Q16]`

Always visible: **period, category, account, search**. Behind a "More filters"
disclosure: type, amount range, status, excluded (hide / show / only). On mobile the
chip row scrolls horizontally. Any active filter shows as a chip with a clear button,
and a "Clear all" appears when more than one is active.

### 7.4 Transactions tab

Top to bottom: summary strip → warning banner (only when something needs review) →
day-grouped list.

The **summary strip** `[Q20]` shows Income, Expenses, and Net for the current filter,
updating live. Per currency when more than one is present.

The **list** groups by day with a sticky date header carrying that day's total `[Q18]`,
newest first.

A **row** `[Q19]`:

```
┌──────────────────────────────────────────────────┐
│ ⬤   Carrefour                          −420.00   │
│ 🛒   CIB · 14:32                            EGP  │
└──────────────────────────────────────────────────┘
```

- Left: a circular chip, category colour at low alpha, Lucide icon in full colour.
- Primary line: merchant, falling back to the category, then to the transaction type.
- Secondary line: account · time of day.
- Right: amount, tabular figures, coloured by direction — negative for money out,
  positive for money in, neutral for transfers.
- Status badge and excluded pill appear only when the state is not normal.

Tapping a row opens the **detail sheet** — a bottom sheet on mobile, a modal on desktop
— showing the parsed fields, the original SMS, and a link to the note. It edits amount,
date, account, category, merchant, note, and the exclude toggle with reason `[Q10]`.
Category and exclude are also one-tap actions directly on the row, via long-press on
mobile and a hover menu on desktop, because those are the two high-frequency actions.

An **Add transaction** button opens a modal for amount, account, category, merchant,
date, and type `[Q11]`, writing a proper transaction note through the same creation
code path the protocol handlers use. It covers cash spending, which has no SMS.

### 7.5 Accounts tab

One card per account: name, type icon, derived balance as the headline, and beneath it
the count of transactions in the current period with money in / money out. Where a
reference `balance` exists, a muted "statement drift" line shows the difference.
Tapping an account filters the Transactions tab to it.

A net-worth figure per currency sits at the top, respecting `include_in_net_worth`.

### 7.6 Stats tab `[Q22]`

Six panels as responsive cards — one column on mobile, two on desktop:

1. **Income vs expenses vs net** for the period.
2. **Spending by category** — a donut with a ranked legend. Tapping a slice filters the
   Transactions tab to that category.
3. **Spending over time** — bars bucketed by day for a month, by month for a year.
4. **Budget progress** — a bar per category with a budget set: spent against budget,
   turning amber at 80% and red past 100%.
5. **Top merchants** — the ten largest by total spend, with transaction counts.
6. **Account balances** — derived balances and net worth per currency.

All charts are **hand-rolled inline SVG** `[Q24]`, built on shared primitives in
`charts/svg.ts`. No dependency, correct in both themes, and a fraction of the bundle
size of a chart library.

### 7.7 Visual design `[Q26, Q28]`

Structure and surfaces come from the Obsidian theme, so the UI never clashes with a
theme change or becomes unreadable. Colour is applied deliberately where it carries
meaning: category identity, and direction of money.

- **Surfaces and text**: `--background-primary`, `--background-secondary`,
  `--background-modifier-border`, `--text-normal`, `--text-muted`.
- **Money**: a semantic pair for positive and negative, defined as CSS custom
  properties with separate light and dark values, so both stay legible.
- **Categories**: the note's `color`, falling back to the 12-colour palette.
- **Numbers**: `font-variant-numeric: tabular-nums` everywhere, so amounts align.
- **Density**: 44px minimum touch targets. Comfortable spacing on mobile, tighter on
  desktop, via a container query on the view width rather than a device check — the
  same layout then works in a narrow desktop sidebar.
- **Motion**: transitions limited to 150ms opacity and transform, all disabled under
  `prefers-reduced-motion`.

The reference points are TrackNest and Wallet: a clear balance header, generous rows
with a coloured category glyph, amounts aligned hard right, and restraint everywhere
else.

---

## 8. Removals

The three generated files are dropped `[Q6]`: `Budget/Stats/Summary.md`,
`Budget/Stats/Needs Review.md`, and `Budget/Stats/transactions.csv`. Each was rewritten
on every run, which churned sync on every capture, and the UI replaces all three.

**One deviation, flagged:** "drop all three" is read as *stop generating files
automatically*, not *lose the ability to export*. CSV export survives as an explicit
command and a button on the Stats tab, writing to a path chosen at export time. Say so
if you would rather it disappear entirely.

`generateStatsWithJavaScript()` and the `refresh-statistics` command are removed with
them. The `process-transactions` command stays, and now also applies exclusion rules.

---

## 9. Errors

- **Malformed frontmatter** — the record is indexed with whatever parsed, missing
  fields left null, and the row shows a warning badge. One bad note never breaks a
  render.
- **Invalid `exclusion_rules.json`** — rules are treated as empty, a notice names the
  file and the parse error, and the Rules editor shows the raw text for repair. No
  automatic rewrite of a file we could not parse.
- **Invalid regex in a rule** — caught at evaluation, the condition is treated as
  non-matching, and the rule is flagged in the editor. Validated on save, before it can
  reach evaluation.
- **Write conflicts** — every mutation is a `processFrontMatter` call, which
  read-modify-writes only the frontmatter block. If sync replaced the file underneath,
  Obsidian's own file handling applies; we do not cache-and-overwrite.
- **Missing account or category referenced by a transaction** — rendered as a plain
  label with a muted "unknown" marker, never a crash, and listed on the Accounts tab as
  an unrecognised name so it can be added to `accounts.json`.

---

## 10. Testing `[Q31]`

Node's built-in `node:test`, extending the existing `tests/` folder. Everything under
`domain/` is a pure function and is covered:

| Module | What is proven |
|---|---|
| `dates.ts` | month/year boundaries, custom ranges, Cairo offset, DST-free but correct across month ends |
| `filter.ts` | each filter alone, filters combined, the excluded tri-state, search across merchant and SMS body |
| `aggregate.ts` | totals skip excluded and transfers; per-currency separation; day and merchant grouping |
| `balances.ts` | derived balance from opening + flows; transfers hitting both accounts; `opening_date` cutoff; excluded skipped |
| `budgets.ts` | spend against budget, the 80% and 100% thresholds, categories with no budget |
| `exclusion.ts` | every operator; `all` vs `any`; manual-wins precedence; rule disabled reverts only rule exclusions; invalid regex |
| `categorize.ts`, `parser/sms.ts` | ported behaviour, guarded by the existing capture-link tests |

Fixtures are realistic Egyptian bank SMS in English and Arabic, including the
"to Ahmed Hassan" shape that motivated the rules engine.

The UI is verified by hand on desktop and iPhone; a rendering bug is visible the moment
the view is opened, which is not true of a wrong total.

---

## 11. Delivery phases

Each phase leaves the plugin working and installable.

| Phase | Delivers |
|---|---|
| 1 | Build setup: TypeScript, esbuild, existing behaviour ported to `src/`, tests still green |
| 2 | Data + domain layers: types, index, filter, aggregate, balances, budgets — fully unit-tested, no UI |
| 3 | Budget view shell, period picker, filter bar, Transactions tab, detail sheet, editing |
| 4 | Exclusion rules: evaluation, storage, editor, processing integration |
| 5 | Accounts tab, Stats tab, SVG charts, category editor, CSV export |
| 6 | Code-block embed, removal of the generated reports, docs, release |

Phase 2 is the one that must not be rushed: every later phase reads from it, and it is
where a quiet arithmetic mistake would go unnoticed.
