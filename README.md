# Finance Automation for Obsidian

Finance Automation parses SMS transaction notes into structured frontmatter using the same local engine on desktop and mobile.

## Features

- Processes pending transaction notes when Obsidian starts.
- Processes pending notes shortly after a transaction note is created or changed.
- Parses configurable English and Arabic SMS patterns.
- Records who was on the other side of every transaction — a `merchant` for a purchase, a `recipient` for money sent, a `sender` for money received — and lists them all in one place so categories can be settled a name at a time.
- Captures a bank SMS from an iPhone automation, either as a file dropped in `Budget/Inbox` or through an `obsidian://` link — the message alone — and derives every field from it in the vault. The inbox is the reliable one: a link cannot carry a long message and is lost when it is what launches Obsidian.
- Captures a manual transaction from a tap-to-fill Shortcut for cash and anything with no SMS.
- Applies exclusion rules, which a manual decision always overrides.
- Shows a spinning ribbon icon while processing.
- Uses only Obsidian APIs: no Python, desktop-only APIs, network requests, or telemetry.

The plugin expects its vault data under `Budget/Transactions/`, `Budget/Accounts/`, and `Budget/Settings/`. Parser patterns and account/category rules remain normal JSON and Markdown files in the vault.

## iPhone Shortcuts

Two ways in. An automation for bank messages, which sends the message and nothing else:

```text
obsidian://finance-sms?message=⟨the URL-encoded message⟩
```

And a Shortcut you tap for cash or anything with no SMS, which supplies the fields from
prompts and dropdowns:

```text
obsidian://finance-transaction?amount=120.50&currency=EGP&account=Cash&type=debit
```

The SMS way needs no date and no other parameter — URL-encode the message and the
plugin reads the amount, currency, type, merchant, category, and the account (from the
account or card number, via `card_endings` on the account note in `Budget/Accounts/`) out
of the message text.
See [iPhone Shortcuts](docs/iphone-shortcuts.md) for the complete steps for both.

## Install with BRAT

1. Install and enable **BRAT** from Obsidian's Community plugins browser.
2. Run **BRAT: Add a beta plugin for testing** from the command palette.
3. Enter `a7med7asan15/obsidian-finance-automation`.
4. Choose the latest version.
5. Open **Settings → Community plugins** and enable **Finance Automation**.
6. Restart Obsidian after the first install, especially on mobile.

BRAT installation requires BRAT 1.1.0 or newer because releases are the source of truth.

### Updating with BRAT

BRAT checks for a newer release when Obsidian starts, so on the iPhone the update usually
arrives on its own. To pull one immediately:

1. Run **BRAT: Check for updates to all beta plugins** from the command palette (or
   **Plugins: Check for updates** in BRAT's settings for this plugin alone).
2. BRAT downloads the new `main.js`, `manifest.json`, and `styles.css` and reloads the
   plugin. Close and reopen Obsidian if the Budget view still shows the old behaviour.

BRAT compares the release tag against the installed `manifest.json` version, so an update
only appears once a release newer than the installed one is published.

## Manual installation

Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub release and place them in:

```text
<vault>/.obsidian/plugins/finance-automation/
```

Restart Obsidian, then enable **Finance Automation** under Community plugins.

## The Budget view

Open it from the wallet icon in the ribbon, or with **Open Budget** from the command
palette. It has five tabs sharing one set of filters.

- **Transactions** — grouped by day, defaulting to the current month. Step months with
  the arrows, or tap the month name to switch to a year, all time, or a custom range.
  Tap a transaction to edit it; long-press (iPhone) or right-click (desktop) for quick
  category and exclude actions. The + button adds one by hand.
- **Merchants** — every merchant, recipient and sender the filtered transactions name,
  one row each, largest first. Choosing a category files every transaction that name
  already has *and* writes the name into `Budget/Settings/Categories/rules.json`, so the
  next message mentioning it files itself. Sort by amount, count, recency, or name, and
  narrow the list to the names still sitting in Uncategorized. The dropdown also offers
  **New category…**, which writes the category and files the name in one step. Reach the
  tab from the command palette with **List merchants, recipients and senders**.
- **Categories** — the same list, read by category instead of by name: a row each, biggest
  first, with what the period spent against it and how its budget is holding up. **Edit**
  opens the colour, icon, monthly budget and keywords in place; the pencil renames and the
  bin deletes. Renaming re-files every transaction that carried the old name and moves its
  keywords along with it. Deleting asks where its transactions should go and sends the note
  to the trash; nothing is deleted from a transaction. A category the transactions name but
  no note describes is listed too, with a button to write its note. **New category** adds
  one. Reach the tab from the command palette with **Edit categories and budgets**, or with
  the button under the Budgets panel on the Stats tab.
- **Accounts** — a card per account with its derived balance, what the period moved through
  it, and how far a statement figure has drifted. The pencil on a card opens everything the
  note holds: name, bank, type, currency, card endings, other names, starting balance and
  date, statement balance, whether the account is still in use and whether it counts towards
  net worth. Renaming an account moves its note *and* re-files every transaction that named
  it, because a balance is matched by name. **New account** writes a note from scratch, and
  an account name the transactions use but no note describes is offered as a **Set up**
  button.
- **Excluding a transaction** keeps it in the list but removes it from every total.
  Use it for a reversal, a duplicate SMS, or anything that did not really happen.
- **Exclusion rules** (command palette: **Edit exclusion rules**) exclude matching
  transactions automatically. A transaction you excluded by hand is never overridden
  by a rule.

## The other side of a transaction

Each transaction note names the party it involved under the key that says what that
party was: `merchant` for a purchase or a fee, `recipient` for money sent, `sender` for
money received. Only ever one of the three, chosen from `transaction_type`, so a salary
is never filed as a shop. Everything that used to read `merchant` — search, exclusion
rules, the CSV export, the top-merchants chart — reads whichever key the note uses.

The names come out of the message itself, using `merchant_patterns`, `recipient_patterns`
and `sender_patterns` in `Budget/Settings/sms_patterns.json`. A built-in set of patterns
for the usual English and Arabic wordings (`at`, `to`, `from`, `عند`, `لدى`, `إلى`, `من`)
runs after whatever that file holds, so a bank's ordinary phrasing is understood out of
the box and a pattern written by hand still takes precedence.

The direction of the money is read the same way. `debit_keywords`, `credit_keywords`,
`transfer_keywords` and `fee_keywords` in that file decide it, and the account wordings are
built in on both sides — `من حسابك`, `تم خصم`, `from your account` for money leaving, and
`إلى حسابك`, `to your account` for money arriving — so either reads correctly whether or not
the vault file lists it. A transfer still wins the type: `تم تحويل 500 من حسابك` stays a
transfer rather than becoming spending. Which side of that transfer your own account sits on
comes from those same keywords, so `تم تنفيذ تحويل لحظي ... إلى حسابك` is money in and the
same sentence with `من حسابك` is money out.

Arabic is matched with its spellings folded together: `إلى`, `الى` and `الي` are one phrase,
as are `بطاقة` and `بطاقه`, and the runs of spaces a bank pads a message with are collapsed.
A keyword can be written whichever way reads best.

## What counts as a transaction

A bank thread is mostly not transactions — statement reminders, due dates, one-time codes,
offers — and those carry amounts and card numbers too, so a reminder to pay a minimum of
`1 جم` would otherwise be filed as a 1 EGP transaction that never happened. A capture
becomes a note only when it says money actually moved: `تم خصم`, `من حسابك`, `إلى حسابك`,
`تم تنفيذ تحويل`, `charged`, `debited`, `credited`, `transferred` and the rest of the
built-in list. Anything else is dropped, and its file in `Budget/Inbox` is deleted rather
than left to be re-read every run; the notice says how many were discarded. A capture link
carrying such a message says so instead of leaving a note behind.

Add `transaction_keywords` to `Budget/Settings/sms_patterns.json` to let an unusual wording
through — the built-in list is appended to whatever that file holds, so an entry there widens
the gate rather than replacing it.

A transaction that reached `status: parsed` is never parsed again, so notes filed before
the parser knew a wording keep an empty party key. **Fill in missing merchants from
stored messages** in the command palette — also offered as a button on the Merchants tab —
reads those messages again and fills only the blanks. A name already in a note, typed or
parsed, is never touched.

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

## Developing the plugin

The plugin is written in TypeScript under `src/` and bundled to a single `main.js` by
esbuild. `main.js` is a build artifact — edit the sources, never the bundle.

**Clone this repo outside your vault.** `node_modules` alone is around a thousand files
and 43 MB; inside a vault, Obsidian indexes all of it at every launch and a sync plugin
tries to push it, which on a phone means a long hang on a black screen at startup.

```bash
git clone https://github.com/a7med7asan15/obsidian-finance-automation.git ~/dev/obsidian-finance-automation
cd ~/dev/obsidian-finance-automation
npm install
npm run dev     # rebuild on change, and copy into <vault>/.obsidian/plugins/finance-automation/
npm test        # unit tests for every calculation
npm run build   # typecheck, then a one-shot production bundle
```

For the build to install itself into your vault, tell it where the vault is — either
`export OBSIDIAN_VAULT=/path/to/vault`, or write that one line into a `.vaultpath` file
in the repo root (gitignored). Without it the bundle is still built, just not copied, and
a path that is not a vault is skipped rather than written to.

After a build, reload Obsidian to pick up the new bundle.

## Privacy

All parsing happens locally. The plugin does not send SMS text, transactions, or settings anywhere.

## Cutting a release

`scripts/release.sh` does the whole update path BRAT watches: it bumps the version,
commits, tags, and pushes, and the push is what starts
[`.github/workflows/release.yml`](.github/workflows/release.yml), which builds the
bundle and publishes the release with its assets.

```bash
scripts/release.sh patch "stops a needs_review note rewriting itself"
scripts/release.sh minor "edits accounts and categories in place"
scripts/release.sh 3.2.0 --dry-run   # run the checks and print the plan, change nothing
```

Take either a bump keyword or an exact `X.Y.Z`. The summary is optional and becomes the
rest of the commit subject after `release: X.Y.Z`.

Before anything is written the script requires main, a clean working tree, a branch not
behind `origin/main`, a version newer than the current one, and a tag that does not exist
yet locally or on origin; then `npm test` and `npm run build` have to pass. Only then does
it write `manifest.json`, `package.json` and `versions.json`, commit those with the rebuilt
`main.js` and `styles.css`, tag the commit, and push the branch and the tag.

A release reaches the iPhone a few minutes later: once the Actions run is green, BRAT sees
a tag newer than the installed `manifest.json` and offers the update on its next check.

## Release format

The GitHub release tag, release name, and `manifest.json` version match. Each release includes `main.js`, `manifest.json`, and `styles.css` as individual assets for BRAT.

## License

MIT
