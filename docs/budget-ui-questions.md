---
type: planning
status: awaiting-answers
created: 2026-09-11
---

# Budget UI — Design Questions

Answer these once, in this file. Put your answer on the `**Answer:**` line under
each question. You can just write `rec` to accept my recommendation, or `A`/`B`/`C`
to pick an option, or write free text. Leave blank = I take the recommendation.

When you're done, tell me "answers are in" and I'll write the design spec and the
implementation plan from this file without re-reading the whole conversation.

---

## What I already know (don't re-answer these)

- Capture happens on iPhone two ways, and both stay. An automation sends the bank
  message — and only the message — to `obsidian://finance-sms`, and the plugin derives
  every field from that text, including the account, from the account/card number in it.
  A manual Shortcut that you tap sends separated fields to
  `obsidian://finance-transaction` for cash and anything with no SMS.
- One Markdown file per transaction under `Budget/Transactions/YYYY/Mon/DDTHH-mm-ss.md`.
  This stays.
- Accounts are notes in `Budget/Accounts/`, categories are notes in
  `Budget/Settings/Categories/`. Default currency EGP, timezone +03:00.
- You want: a Transactions page with category + date filters (defaults to this month,
  switchable to any month or year), account separation with balances, an exclude flag
  that hides a transaction from math but keeps it visible, and a Stats page.
- The UI must look good and must work well on iPhone.

---

# 1. Architecture

## Q1. Extend the existing plugin, or build a second plugin?

- **A.** Extend `finance-automation` — the UI ships in the same plugin as the parser.
  One install, one BRAT source, shared data layer.
- **B.** New separate plugin `finance-budget` that reads the same vault folders.
  Parser and UI evolve independently, but two installs and duplicated data code.

**My recommendation: A.** The UI needs exactly the same reader (frontmatter →
records) the stats generator already has. Splitting it means maintaining two copies
of that reader, and BRAT updates on iPhone are annoying enough once.

**Answer:**
A
---

## Q2. Add a TypeScript + esbuild build step?

Today `main.js` is hand-written plain JS with no build. A rich UI will be roughly
3–5k lines; keeping that in one hand-edited file gets painful fast.

- **A.** TypeScript sources in `src/`, esbuild bundles to a single `main.js`.
  Output stays one file, so BRAT/iPhone install is unchanged. Requires Node on the
  desktop to build, and `main.js` becomes a build artifact committed to the repo.
- **B.** Stay plain JS, but split into multiple files that esbuild concatenates.
  Same build requirement, no type safety.
- **C.** Stay plain JS, one file, no build. Zero tooling, but a 4000-line file.

**My recommendation: A.** Type safety over frontmatter records is worth a lot here
(every field is optional and string-or-number), and it's the standard Obsidian setup.
Say no if you ever want to hand-edit `main.js` directly on the iPhone.

**Answer:**
A
---

## Q3. No UI framework, right?

- **A.** Vanilla TypeScript + DOM, using Obsidian's own building blocks
  (`Setting`, `Menu`, `setIcon`) and CSS. Small bundle, fast on iPhone, looks native.
- **B.** Svelte — nicer component code, ~15 KB overhead, build gets more complex.
- **C.** React/Preact — heaviest, most familiar.

**My recommendation: A.** Obsidian's own UI is vanilla DOM; matching it is what makes
a plugin look "built in" rather than bolted on. Reactivity here is simple
(filters change → recompute → re-render a list), so a framework buys little.

**Answer:**
A
---

## Q4. Where does the UI live — app views or notes?

- **A.** A custom workspace view ("Budget") opened from a ribbon icon and commands,
  with tabs for **Transactions / Accounts / Stats**. Filter state persists while the
  view is open. Feels like an app.
- **B.** Real notes (`Budget/Transactions.md`, `Budget/Stats.md`) containing a
  ```finance-transactions``` code block that the plugin renders into. Pinnable,
  linkable, syncs as files, but re-renders on every note reload and Live Preview can
  be finicky with interactive widgets.
- **C.** Both: custom views as the primary app, plus code-block embeds so you can
  drop a small summary widget into any note.

**My recommendation: C, staged** — build A first, add the code-block embed after the
app works. A gives reliable state and the best mobile experience; the embed is a
small addition once the renderer exists.

**Answer:**
C
---

## Q5. One view with tabs, or three separate views?

- **A.** One "Budget" view, three tabs inside it, shared filter state — switching to
  Stats keeps your month/category filters applied.
- **B.** Three separate views you open independently, each with its own filters.

**My recommendation: A.** Shared filters is the whole point — "show me Stats for
exactly what I'm looking at" only works if the filter is shared.

**Answer:**
A
---

## Q6. Keep generating the static Markdown reports?

`Budget/Stats/Summary.md`, `Needs Review.md`, and `transactions.csv` are regenerated
on every run today.

- **A.** Keep all of them. Redundant with the UI, but readable anywhere and a decent
  backup/export.
- **B.** Keep `transactions.csv` only (useful export), drop the two Markdown reports
  since the UI replaces them.
- **C.** Drop all three.

**My recommendation: B.** The UI makes Summary.md and Needs Review.md dead weight
that also churn your sync on every run. CSV export stays useful for spreadsheets.

**Answer:**
C
---

# 2. Data model

## Q7. How should "exclude from calculations" be stored?

- **A.** New boolean frontmatter field `excluded: true` plus an optional
  `exclude_reason: "..."`, independent of `status`. Excluded rows still render, shown
  dimmed/struck-through, and are skipped by every total.
- **B.** Reuse `status: excluded`. Simpler, but you'd lose whether it was parsed
  correctly, and the parser would have to learn not to re-process it.

**My recommendation: A.** `status` means "how well do we understand this note";
`excluded` means "does it count". Those are different questions and collapsing them
will bite.

**Answer:**
A
---

## Q8. What does "it didn't happen" actually cover?

Which of these do you want to exclude? (tick all that apply — this drives whether I
need one flag or a reason taxonomy)

- [ ] Failed / reversed / declined transactions
- [ ] Duplicate SMS for the same real purchase
- [ ] Pre-authorization holds that later settled at a different amount
- [ ] Refunds you want netted out rather than counted as income
- [ ] Transfers between your own accounts
- [ ] Test / junk notes
- [ ] Something else: ______

**My recommendation:** one `excluded` boolean + a free-text `exclude_reason`, with
transfers handled separately (they're already special-cased, see Q14).

**Answer:**
one `excluded` boolean + a free-text `exclude_reason`, with
transfers handled separately

---

## Q9. Should `pending` and `needs_review` transactions count in totals?

A transaction the parser couldn't fully read still has an amount sometimes.

- **A.** Count anything with a usable amount, regardless of status. Show a warning
  badge on the row and a "N unreviewed" banner at the top.
- **B.** Count only `status: parsed`. Everything else is visible but excluded from math.
- **C.** Count them, but show two totals: "confirmed" and "including unreviewed".

**My recommendation: A.** If money left your account, it should show in your spend
even if the merchant name is garbage. The banner keeps it honest.

**Answer:**
A
---

## Q10. Can you edit transactions from the UI?

- **A.** Full inline edit: tap a row → a panel to change category, account, amount,
  merchant, note, and toggle exclude. Writes back to the note's frontmatter.
- **B.** Only the two things you'll actually use in bulk: set category, toggle
  exclude. Everything else you edit in the note itself.
- **C.** Read-only UI; tapping a row opens the Markdown note.

**My recommendation: A**, with B's actions also available as one-tap buttons directly
on the row (swipe or long-press on mobile). Categorizing and excluding are the
high-frequency actions; the rest belongs in a detail panel you open occasionally.

**Answer:**
A
---

## Q11. Do you want a manual "Add transaction" button in the UI?

You capture from Shortcuts, but a desktop quick-add (cash spending, splitting a bill)
might be worth it.

- **A.** Yes — a modal with amount / account / category / merchant / date, creating a
  proper transaction note.
- **B.** No — Shortcuts and the template cover it.

**My recommendation: A.** It's cheap once the edit panel from Q10 exists, and cash
transactions have no SMS to capture.

**Answer:**
A
---

# 3. Accounts and balances

## Q12. How is an account's current balance determined?

This is the most important question in the file. Today the README deliberately says
balances are **not** derived from SMS, because banks send messages late and skip fees.

- **A. Derived.** Each account note holds `opening_balance` and `opening_date`.
  Current balance = opening balance + every non-excluded transaction touching it.
  Always self-consistent; wrong the moment a transaction is missing.
- **B. Manual only.** You type `balance` from your bank statement. The UI shows the
  stated balance and, next to it, the net flow from recorded transactions so you can
  eyeball drift.
- **C. Reconciled (hybrid).** You periodically enter a statement balance with a date.
  The UI shows: last statement balance, plus transactions since that date, equals
  projected balance — and flags the gap when you enter the next statement.

**My recommendation: C.** It gives you a live number you can trust day-to-day and a
hard checkpoint that catches missed SMS instead of silently drifting forever. It's
maybe a day more work than A.

**Answer:**
A
---

## Q13. Multiple currencies — convert, or keep separate?

Config supports EGP/USD/EUR/GBP/SAR/AED.

- **A.** Keep strictly separate. Every total, chart, and balance is per currency.
  No FX rates anywhere. (What the code does today.)
- **B.** Manual FX rates in `Settings/config.json`, with an optional "show everything
  in EGP" toggle. Converted figures marked as approximate.
- **C.** Live FX rates from an API.

**My recommendation: A** for now, with the data model built so B can be added later.
C is out — it means network calls from your finance vault, and it breaks offline.

**Answer:**
A
---

## Q14. How should transfers between your own accounts be treated?

- **A.** Never income, never expense. They move the balance on both accounts and
  appear in a separate "Transfers" section of the stats.
- **B.** Same as A, but also auto-exclude them from the transaction list by default
  (with a filter chip to show them).

**My recommendation: A.** They should be visible in the list — you want to see the
money move — just never counted as spending.

**Answer:**
A
---

## Q15. Which accounts do you actually have?

`Settings/accounts.json` currently only has "Cash". List the real ones so I can write
a sensible migration and realistic test fixtures — name, type (bank / card / wallet /
cash), currency, and card ending if any. Real names are fine, they stay local.

```
Example:
- CIB Current   | bank   | EGP | card ending 1234
- InstaPay      | wallet | EGP |
- Cash          | cash   | EGP |
```

**Answer:**
- CIB           | bank   | EGP | card ending 0774
- Cash          | cash   | EGP |
---

# 4. Transactions page

## Q16. Which filters do you want, and which are visible by default?

- [ ] Date range — **default: this month**, presets for month / year / all / custom
- [ ] Category — multi-select
- [ ] Account — multi-select
- [ ] Type — debit / credit / transfer / fee
- [ ] Text search — merchant, SMS body, notes
- [ ] Amount range (min/max)
- [ ] Status — parsed / needs review / pending
- [ ] Excluded — hide / show / only
- [ ] Something else: ______

**My recommendation:** date + category + account + search always visible as a compact
filter bar; type, amount, status, and excluded behind a "More filters" disclosure so
the mobile screen stays clean.

**Answer:**
date + category + account + search always visible as a compact
filter bar; type, amount, status, and excluded behind a "More filters" disclosure so
the mobile screen stays clean.
---

## Q17. What does the date picker look like?

- **A.** A month stepper — `‹ September 2026 ›` — with a dropdown to switch the unit
  to Year or All time, and a "Custom range" option.
- **B.** Two date inputs (from / to) plus quick-pick chips: This month, Last month,
  This year, All.
- **C.** Both: the stepper is primary, chips underneath for quick jumps.

**My recommendation: C.** Stepping back one month is the single most common action and
deserves one tap; the chips cover the rest.

**Answer:**
C
---

## Q18. Should the list group transactions by day?

- **A.** Grouped by day with a date header showing that day's total, transactions
  newest first within each day.
- **B.** One flat list, newest first, sortable by column.
- **C.** Grouped by day on mobile, flat sortable table on desktop.

**My recommendation: A.** Day grouping is what every budget app does, it reads well at
both widths, and the per-day subtotal is genuinely useful.

**Answer:**
A
---

## Q19. What shows on a transaction row?

Rank these — what must be visible without tapping? On mobile only about four items fit.

Candidates: amount, merchant, category (with colour/icon), account, time of day,
transaction type, status badge, excluded indicator, currency.

**My recommendation:** category icon on the left; merchant as the primary line with
account + time as a smaller second line; amount on the right, coloured by direction
(red out / green in). Status and excluded appear only when they're not normal.

**Answer:**
Recommended
---

## Q20. Do you want a summary strip above the list?

- **A.** Yes — Income / Expenses / Net for the current filter, updating live as you
  change filters.
- **B.** Yes, plus a small sparkline of daily spend across the selected range.
- **C.** No, keep the list clean.

**My recommendation: B.** The sparkline is cheap to draw and it's the fastest way to
spot an unusual day.

**Answer:**
A
---

## Q21. Bulk actions?

Select several transactions and categorize or exclude them all at once.

- **A.** Yes — multi-select mode with "set category" and "exclude" actions.
- **B.** No, one at a time is fine.

**My recommendation: B for v1.** You'd mostly use it right after a bulk SMS import;
better to see whether that's a real pain before building selection UI.

**Answer:**
B
---

# 5. Stats page

## Q22. Which panels do you want? (tick all)

- [ ] Income vs expenses vs net for the selected period
- [ ] Spending by category — donut or horizontal bars, tap a slice to filter the list
- [ ] Spending trend over time — bars by day/week/month
- [ ] Budget progress per category (uses the existing `monthly_budget` field)
- [ ] Top merchants by spend
- [ ] Account balances and net worth
- [ ] Month-over-month comparison (this month vs last, % change)
- [ ] Average daily spend, and projected month-end total
- [ ] Largest transactions in the period
- [ ] Recurring / subscription detection
- [ ] Something else: ______

**My recommendation:** the first six for v1. Comparison, projection, and largest-
transactions in v1.1. Recurring detection is a research project of its own — later.

**Answer:**
Recommended
---

## Q23. Do you want budgets per category?

`monthly_budget` already exists in category notes but every one is empty.

- **A.** Yes — set a monthly budget per category, stats shows progress bars that turn
  amber near the limit and red over it.
- **B.** Yes, and I want to set the budget from the UI, not by editing the note.
- **C.** Not now.

**My recommendation: B.** Budgets are most of what makes this a "budget tracker"
rather than a spending log, and editing YAML on an iPhone is miserable.

**Answer:**
B
---

## Q24. How are charts drawn?

- **A.** Hand-rolled inline SVG. No dependency, themes correctly with Obsidian's
  colours, tiny bundle, works offline. I write the bar/donut/line primitives.
- **B.** Bundle a chart library (Chart.js ≈ 70 KB, uDraw smaller). Faster to build,
  bigger bundle, needs theme wiring anyway.

**My recommendation: A.** These are simple chart types, the SVG is a few hundred lines
total, and it will match your Obsidian theme exactly in both light and dark mode.

**Answer:**
A
---

## Q25. Should `Budget/Big/2026.md` (planned large expenses) be part of this?

There's a table there of big planned expenses — Mac, Sahel, Sokhna, Saudi trip.

- **A.** Out of scope. Leave it as a manual note.
- **B.** In scope later — a "Planned expenses" section that tracks goals against actual
  spending. I'd note it as a follow-up, not build it now.
- **C.** In scope now.

**My recommendation: B.** It's a genuinely different feature (forward-looking goals vs
backward-looking ledger) and bundling it will double the size of v1.

**Answer:**
A
---

# 6. Look and feel

## Q26. Visual style?

- **A.** Native Obsidian — uses your theme's colours and fonts throughout, so it
  matches whatever theme you switch to. Looks like a first-class part of the app.
- **B.** Opinionated custom style — its own palette, cards, and typography, consistent
  regardless of theme. Looks like a dedicated budget app dropped inside Obsidian.
- **C.** Native structure with accent colour and category colours of its own.

**My recommendation: C.** Theme-native surfaces and text (so it never clashes or
becomes unreadable when you change themes) plus a deliberate palette for categories
and amounts, which is where colour actually carries meaning.

**Answer:**
C
---

## Q27. Category colours and icons?

- **A.** Each category note gets `color` and `icon` frontmatter, editable from a
  category settings screen in the UI.
- **B.** I pick a fixed palette and map it to your existing categories in code.
- **C.** Auto-generate a stable colour by hashing the category name. Zero config,
  ugly combinations possible.

**My recommendation: A**, with B as the fallback for categories that haven't set one.
Icons from Obsidian's built-in Lucide set, so no assets to ship.

**Answer:**
A
---

## Q28. Anything you want it to look like?

Name an app whose budget UI you like (YNAB, Copilot, Monarch, Wallet, Mint, the iOS
Wallet app...), or paste a screenshot into this folder and mention the filename. This
is the highest-leverage answer in the file for "very nice UI".

**Answer:**
There is local app in Egypt called tracknest. but actually any app I would call nice like Wallet for example.
---

# 7. Operations

## Q29. Roughly how many transactions per month, and how far back?

Drives whether I need virtualized list rendering and an on-disk index, or whether
reading everything through the metadata cache on each render is fine. Under about
5,000 total I'd keep it simple.

**Answer:**
around 100-200 per month maybe
---

## Q30. Is the vault synced, and does anything else write these files?

I can see `github-gitless-sync` is installed. If two devices can write the same
transaction note, I need to be careful about read-modify-write on frontmatter.

- Which sync are you using, and do you ever have Obsidian open on iPhone and desktop
  at the same time?

**Answer:**
I use gitless sync to sync with iPhone. It's currently synced yes
---

## Q31. How do you want to test this?

- **A.** Node unit tests for the data layer (filtering, aggregation, balance
  reconciliation, exclusion rules) — pure functions, no Obsidian needed. Manual
  testing for the UI. This is what the existing `tests/` folder does.
- **B.** A + a mocked Obsidian API so view rendering can be tested headlessly.
- **C.** Manual only.

**My recommendation: A.** All the logic that can actually be wrong silently — money
math — is testable as pure functions. UI bugs are obvious the moment you look.

**Answer:**
A
---

# 8. Anything I missed

Anything you want that isn't covered above? Things that came to mind while reading:
attachments/receipts, tags on transactions, splitting one transaction across
categories, notes/comments per transaction, an end-of-month review flow, export to
your accountant, recurring bill reminders.

**Answer:**
Yes, I want to make rules. For example, any sms that contains to Ahmed Hassan from CIB account should be excluded. These rules should be easily modified. to auto exclude transactions. Write the plans in tasks so another agent will work on them. 