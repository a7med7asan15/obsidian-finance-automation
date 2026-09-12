# Finance Automation for Obsidian

Finance Automation parses SMS transaction notes into structured frontmatter using the same local engine on desktop and mobile.

## Features

- Processes pending transaction notes when Obsidian starts.
- Processes pending notes shortly after a transaction note is created or changed.
- Parses configurable English and Arabic SMS patterns.
- Captures a bank SMS from an iPhone automation through an `obsidian://` link — the message alone — and derives every field from it in the vault.
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
account or card number, via `card_endings` in `Budget/Settings/accounts.json`) out of the
message text.
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

## Release format

The GitHub release tag, release name, and `manifest.json` version match. Each release includes `main.js`, `manifest.json`, and `styles.css` as individual assets for BRAT.

## License

MIT
