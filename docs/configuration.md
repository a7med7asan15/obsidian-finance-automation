# Configuration reference

Every setting lives in `Budget/Settings/` as an ordinary note: some words explaining what
the file is, then one ```json block holding the data. Open one in Obsidian, edit the block,
and the plugin reads the change on its next pass — or change it in the Budget view and the
block is rewritten in place, prose and all.

> A vault set up by an older release has the same files with a `.json` extension. Those keep
> working exactly where they are, read and written; nothing is migrated behind your back.

**You need none of this to start.** [Create budget folders](../README.md#quick-start) writes
every file below, already filled in, and the Budget view edits all of them.

Running that command again is a **reset**: every file on this page goes back to its default,
including the keywords the Merchants tab has learned and any budget or colour set on a
starting category. Transactions are never touched.

---

## Accounts

The note in `Budget/Accounts/` is the source of truth. `Budget/Settings/accounts.md` holds
the same shape for an account you would rather not give a note, and the two are **merged by
name** — a card ending listed in either one resolves to the account.

<table>
<tr><th><code>Budget/Accounts/CIB Visa.md</code></th><th>the block in <code>Budget/Settings/accounts.md</code></th></tr>
<tr><td>

```yaml
---
type: account
name: "CIB Visa"
currency: EGP
card_endings: ["1234"]
aliases: ["cib"]
opening_balance: 0
opening_date: "2026-01-01"
active: true
include_in_net_worth: true
---
```

</td><td>

```json
{
  "accounts": [
    {
      "name": "CIB Visa",
      "currency": "EGP",
      "card_endings": ["1234"],
      "aliases": ["cib"]
    }
  ]
}
```

</td></tr>
</table>

An account also matches when its name or one of its `aliases` appears in the message. When
nothing matches, the transaction is filed under `Card ••••1234` so the number is never
lost — and it re-files itself the moment an account claims that ending.

## Categories

A category note carries how it *looks and budgets*; `rules.md` carries how a message
*finds* it. A fresh vault starts with eight categories and a keyword list for each, and the
Merchants tab keeps writing to both as you categorise by hand.

`Budget/Settings/Categories/Groceries.md`:

```yaml
---
type: category
name: "Groceries"
currency: EGP
monthly_budget: 4000
color: "#4caf50"
icon: shopping-cart
---
```

`Budget/Settings/Categories/rules.md` — first matching keyword wins, case-insensitive,
matched as a substring of the message:

```json
{
  "rules": [
    { "category": "Groceries", "keywords": ["carrefour", "seoudi", "gourmet"] },
    { "category": "Transport", "keywords": ["uber", "careem", "bolt"] }
  ]
}
```

## Default currency

`Budget/Settings/config.md`, used when a message names an amount but no currency:

```json
{ "default_currency": "EGP" }
```

## Parser patterns

**This file is optional.** Every key in it is built in already, so a vault that never
creates it still reads an amount, a card ending, a direction, a name and a date. Write one
only when your bank says something the built-ins miss.

Every key is optional on its own too, every value is a list, and your pattern is always
tried first. How the built-in list joins yours depends on the key:

| Key | Decides | Your list |
|---|---|---|
| `amount_patterns` | `amount` and `currency` | **replaces** the built-in one |
| `card_ending_patterns` | the digits looked up in `card_endings` | **replaces** the built-in one |
| `transaction_keywords` | whether the message is parsed at all — it must say money moved | is added to |
| `debit_keywords`, `credit_keywords`, `transfer_keywords`, `fee_keywords` | `transaction_type`, and which side of a transfer your account is on | is added to |
| `merchant_patterns`, `recipient_patterns`, `sender_patterns` | the name of the other side | is added to |
| `date_patterns` | `timestamp`, when the message carries a date | is added to |

The first two replace rather than widen because **order decides which number in a message
wins** — appending to a list you tuned by hand would change what your vault already reads,
and a pattern you deliberately deleted would come back. The rest only ever widen, so
adding to them cannot break a message that already parsed.

Patterns use Python-flavoured regular expressions: `(?i)` for case-insensitivity, and a
named group `(?P<name>…)` for the capture (the first unnamed group is used as a fallback).

```json
{
  "transaction_keywords": ["تم سداد"],
  "merchant_patterns": [
    "(?i)(?:at|merchant)\\s+(?P<name>[A-Za-z0-9][A-Za-z0-9 .&'/_-]{1,60}?)(?=\\s+(?:on|using|balance)\\b|[.;,]|$)"
  ],
  "recipient_patterns": [
    "(?i)(?:إلى|الى|لحساب)\\s+(?P<name>[^.;,\\n]{2,60}?)(?=\\s+(?:في|الرصيد)|[.;,]|$)"
  ]
}
```

Built in already, so most banks need nothing here:

- **Amount** — a currency before or after the number (`EGP 1,234.56`, `1,234.56 EGP`,
  `250.75 ج.م`), or after `amount` / `amt` / `مبلغ`. Recognised codes: EGP, USD, EUR, GBP,
  SAR, AED and `ج.م`.
- **Card ending** — four digits after `card` / `acct` / `account` / `a/c` / `ending`, a run
  of `*` or `x`, or `بطاقتك` / `حسابك` / `بطاقة` / `حساب`.
- **Direction** — `debited`, `charged`, `purchase`, `withdrawn`, `من حسابك`, `تم خصم` for
  money out; `credited`, `deposited`, `refunded`, `إلى حسابك`, `تم إيداع` for money in;
  `transfer` / `تحويل` for a transfer; `commission`, `annual fee`, `عمولة`, `رسوم` for a fee.
- **The other side** — `at` / `عند` / `لدى` for a merchant, `to` / `إلى` / `لحساب` for a
  recipient, `from` / `من` for a sender.
- **Date** — `08-09-2026`, `8/9/2026`, `05.09.2026` (**day first**) and `2026-09-08`, each
  with an optional 24-hour time. A bank that writes the month first, or a 12-hour clock,
  needs its own `date_patterns` entry here.

A bare number with no currency anywhere near it is deliberately not read as an amount — that
is what keeps a reference number or a due-date figure out of your ledger.

## Exclusion rules

`Budget/Settings/exclusion_rules.md`, or the editor under **Edit exclusion rules**:

```json
{
  "rules": [
    {
      "id": "refunds",
      "name": "Reversals",
      "enabled": true,
      "reason": "Reversed by the bank",
      "match": "all",
      "conditions": [
        { "field": "sms_message", "op": "contains", "value": "استرداد" }
      ]
    }
  ]
}
```

- `field` — `sms_message`, `merchant`, `from_account`, `to_account`, `category`,
  `transaction_type`, `amount`, `timestamp`. (`merchant` matches a recipient and a sender too.)
- `op` — `contains`, `not_contains`, `equals`, `not_equals`, `starts_with`, `ends_with`,
  `matches`, `gt`, `lt`, `between` (which also takes `value2`).
- `match` — `all` or `any`.

## Plugin settings

**Settings → Community plugins → Ultra Budget Tracker**: process on startup, watch
transaction notes, apply exclusion rules automatically, and a shortcut to the rules editor.

---
