# iPhone Shortcuts

Two ways in, one for each situation:

| Way | URL | You provide |
|---|---|---|
| **SMS** — automatic, for bank messages | `obsidian://finance-sms` | nothing but the message text |
| **Manual** — you tap it, for cash and anything with no SMS | `obsidian://finance-transaction` | the details, through prompts and dropdowns |

Enable Finance Automation and restart Obsidian once before using either link, so the URL
handlers are registered.

---

## 1. The SMS way

The automation sends **only the message content**. No sender, no date, no encoding, no
extra actions. Everything else is read out of the message text inside Obsidian.

```text
obsidian://finance-sms?message=[Message content]
```

### Build it — two actions

1. Open **Shortcuts → Automation → +** and choose **Message**.
2. Tap **Sender** and pick the bank's sender name or number. This is only the trigger
   condition — iOS needs one, and nothing about the sender is sent to Obsidian.
3. Choose **Run Immediately**, tap **Next**, then **New Blank Automation**.
4. Add **Text** and type the link, inserting the message variable at the end:

   ```text
   obsidian://finance-sms?message=[Shortcut Input]
   ```

   Tap the variable chip and choose **Content** if the automation offers it; otherwise
   **Shortcut Input** is already the message text.
5. Add **Open URLs** with that **Text** as its input.
6. Tap **Done**.

That is the whole automation. Nothing else belongs in it.

### What Obsidian reads out of the message

The note is created with `status: pending` and the full message stored in `sms_message`
and in the **Original SMS** block. Processing starts automatically a moment later and
fills in the rest from the text alone, using
`Budget/Settings/sms_patterns.json`:

| Field | Read from the message by |
|---|---|
| `amount`, `currency` | `amount_patterns`, falling back to `default_currency` in `config.json` |
| `from_account` / `to_account` | `card_ending_patterns` — the account or card number in the message, looked up in `card_endings` in `accounts.json` |
| `transaction_type` | the `debit`, `credit`, `transfer`, and `fee` keyword lists |
| `merchant` | `merchant_patterns` |
| `category` | the keyword rules in `Budget/Settings/Categories/` |
| `timestamp` | the date in the message when it carries one, otherwise the moment the link opened |

The account number is the hinge: give each account its digits in
`Budget/Settings/accounts.json` and every message from that card files itself.

```json
{
  "accounts": [
    { "name": "CIB Visa", "currency": "EGP", "card_endings": ["1234"], "aliases": ["cib"] },
    { "name": "Cash", "currency": "EGP", "card_endings": [], "aliases": ["cash"] }
  ]
}
```

An account also matches when its name or one of its `aliases` appears in the message.
When nothing matches, the transaction is filed under `Card ••••1234`, so the number is
never lost.

The note becomes `status: parsed` once it has an amount, a currency, a type, and an
account. Anything less becomes `status: needs_review` — never dropped. Add the missing
pattern, alias, or card ending, then run **Process pending SMS transactions** from the
command palette.

### One thing to know about skipping the encoding

Because the message goes into the link as-is, a literal `&` or `#` in a bank SMS ends the
`message` parameter early. The plugin puts the message back together from the stray
parameters that Obsidian splits off, so the whole text still lands in the note. Keep the
automation as it is — the handling belongs in the plugin, not in the Shortcut.

---

## 2. The manual way

A Shortcut you run yourself — from the Shortcuts app, a Home Screen icon, or a widget —
when there is no SMS to work from. It asks for the details and sends them already
separated, so Obsidian stores them without parsing anything.

```text
obsidian://finance-transaction?amount=[Amount]&currency=[Currency]&account=[Account]&type=[Type]&merchant=[Encoded merchant]
```

### Build it

1. In the **Shortcuts** tab, tap **+** and name it something like *Add Transaction*.
2. Add **Ask for Input**. Set **Input Type** to **Number** and the prompt to `Amount`.
3. Add **Choose from Menu** with the prompt `Currency` and one item per currency:
   `EGP`, `USD`, `EUR`. Each branch does nothing — the chosen item is the value you use.
4. Add **Choose from Menu** with the prompt `Account` and one item per account, spelled
   exactly as the `name` in `Budget/Settings/accounts.json`. Write a space as `%20`, so
   `CIB Visa` becomes `CIB%20Visa`.
5. Add **Choose from Menu** with the prompt `Type` and four items: `debit`, `credit`,
   `transfer`, `fee`.
6. Add **Ask for Input** with **Text** and the prompt `Merchant` — or skip this step and
   step 7 if you do not want to be asked.
7. Add **URL Encode** with that text as its input. This one is needed: a merchant you
   type by hand can contain anything.
8. Add **Text** and build the link with the chosen values:

   ```text
   obsidian://finance-transaction?amount=[Amount]&currency=[Currency]&account=[Account]&type=[Type]&merchant=[URL Encoded Text]
   ```
9. Add **Open URLs** with that **Text**.
10. Tap **Done**, then long-press the Shortcut → **Add to Home Screen** if you want it one
    tap away.

The note is created `status: parsed` when amount, currency, type, and an account are all
present, and `status: needs_review` otherwise.

### Parameters

| Parameter | Property | Details |
|---|---|---|
| `amount` | `amount` | Number; grouping commas are accepted |
| `currency` | `currency` | For example `EGP`, `USD`, or `EUR` |
| `account` | `from_account` or `to_account` | Destination for a `credit`, source otherwise |
| `type` | `transaction_type` | `debit`, `credit`, `transfer`, or `fee` |
| `from` | `from_account` | Explicit source; use with `to` for a transfer |
| `to` | `to_account` | Explicit destination |
| `merchant` | `merchant` | Optional |
| `category` | `category` | Optional; defaults to `Uncategorized` |
| `timestamp` | `timestamp` | Optional ISO 8601; the current time is used when omitted |

For a transfer, replace `account` with `from` and `to`.

Keep the **URL Encode** step for any value you type by hand. Fixed dropdown values are
safe as long as you write their spaces as `%20`.

---

## When something does not land

| Symptom | Cause |
|---|---|
| Nothing happens when the link opens | Plugin not enabled, or Obsidian not restarted since installing it |
| Note appears but stays `pending` | Processing has not run yet; run **Process pending SMS transactions** |
| `needs_review` with no account | The card digits are missing from `card_endings`, or the bank's wording is not in `card_ending_patterns` |
| SMS text cut off mid-way | The message contained a literal `&` or `#` — see above |
| Manual note has a mangled account | A space in a dropdown value was not written as `%20` |

If the phone holds more than one vault, open the finance vault once: the link is handled
by the vault Obsidian has open.

## Privacy

The links open the installed Obsidian app. Finance Automation writes and parses the
transaction inside the vault and makes no network requests.
