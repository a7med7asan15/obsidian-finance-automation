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
obsidian://finance-sms?message=[Message content]
```

And a Shortcut you tap for cash or anything with no SMS, which supplies the fields from
prompts and dropdowns:

```text
obsidian://finance-transaction?amount=120.50&currency=EGP&account=Cash&type=debit
```

The SMS way needs no date, no encoding, and no other parameter — the plugin reads the
amount, currency, type, merchant, category, and the account (from the account or card
number, via `card_endings` in `Budget/Settings/accounts.json`) out of the message text.
See [iPhone Shortcuts](docs/iphone-shortcuts.md) for the complete steps for both.

## Install with BRAT

1. Install and enable **BRAT** from Obsidian's Community plugins browser.
2. Run **BRAT: Add a beta plugin for testing** from the command palette.
3. Enter `a7med7asan15/obsidian-finance-automation`.
4. Choose the latest version.
5. Open **Settings → Community plugins** and enable **Finance Automation**.
6. Restart Obsidian after the first install, especially on mobile.

BRAT installation requires BRAT 1.1.0 or newer because releases are the source of truth.

## Manual installation

Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub release and place them in:

```text
<vault>/.obsidian/plugins/finance-automation/
```

Restart Obsidian, then enable **Finance Automation** under Community plugins.

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

## Privacy

All parsing happens locally. The plugin does not send SMS text, transactions, or settings anywhere.

## Release format

The GitHub release tag, release name, and `manifest.json` version match. Each release includes `main.js`, `manifest.json`, and `styles.css` as individual assets for BRAT.

## License

MIT
