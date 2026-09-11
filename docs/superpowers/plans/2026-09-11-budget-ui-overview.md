# Budget UI — Plan Overview

The spec (`docs/superpowers/specs/2026-09-11-budget-ui-design.md`) is split into three
plans. Each one ends with a plugin that installs, runs, and can be used — so work can
stop between plans without leaving the vault broken.

| Plan | File | Delivers | Done when |
|---|---|---|---|
| A | `2026-09-11-budget-ui-a-foundation.md` | TypeScript + esbuild build, existing behaviour ported to `src/`, data layer, and every pure calculation unit-tested | `npm test` green; plugin still captures and parses SMS exactly as today |
| B | `2026-09-11-budget-ui-b-transactions.md` | Budget view, period picker, filter bar, Transactions tab, edit sheet, add-transaction, exclusion rules + editor | A usable budget tracker on iPhone and desktop |
| C | `2026-09-11-budget-ui-c-stats.md` | Accounts tab, Stats tab, SVG charts, category editor, CSV export, code-block embed, removal of the generated reports, release | Feature-complete against the spec |

**Execute them in order.** B consumes the interfaces A produces; C consumes both.

## Before starting Plan A

The plugin repo has uncommitted changes on `main.js`, `README.md`, and
`docs/iphone-shortcuts.md`. Commit or stash them first — Plan A rewrites `main.js` as a
build artifact, and uncommitted work there would be lost.

```bash
cd Budget/obsidian-finance-automation
git status --short
git add -A && git commit -m "chore: check in working changes before TypeScript migration"
```

## Repo layout note

The plugin source lives **inside the vault** at
`Budget/obsidian-finance-automation/`, and the installed copy sits at
`.obsidian/plugins/finance-automation/`. They are separate copies today and the build
must sync them — see Plan A, Task 2.
