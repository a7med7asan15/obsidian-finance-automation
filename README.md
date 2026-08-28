# Finance Automation for Obsidian

Finance Automation processes SMS transaction notes and generates finance reports using the same local JavaScript engine on desktop and mobile.

## Features

- Processes pending transaction notes when Obsidian starts.
- Processes and refreshes reports after a transaction note is created or changed.
- Parses configurable English and Arabic SMS patterns.
- Captures raw SMS text or structured transaction fields from iPhone Shortcuts through `obsidian://` links.
- Generates `Stats/Summary.md`, `Stats/Needs Review.md`, and `Stats/transactions.csv`.
- Shows a spinning ribbon icon while processing.
- Uses only Obsidian APIs: no Python, desktop-only APIs, network requests, or telemetry.

The plugin expects its vault data under `Transactions/`, `Accounts/`, and `Settings/`. Parser patterns and account/category rules remain normal JSON and Markdown files in the vault.

## iPhone Shortcuts

Version 2.1.0 adds two capture actions:

```text
obsidian://finance-sms?message=[Encoded SMS]&timestamp=[Encoded ISO date]
```

This sends the original SMS and lets the plugin parse its transaction fields locally.

```text
obsidian://finance-transaction?amount=120.50&currency=EGP&account=Visa%201234&type=debit
```

This creates a transaction from fields that have already been collected or parsed. See [iPhone Shortcuts](docs/iphone-shortcuts.md) for parameters, examples, and setup instructions.

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

## Privacy

All parsing and report generation happen locally. The plugin does not send SMS text, transactions, or settings anywhere.

## Release format

The GitHub release tag, release name, and `manifest.json` version match. Each release includes `main.js`, `manifest.json`, and `styles.css` as individual assets for BRAT.

## License

MIT
