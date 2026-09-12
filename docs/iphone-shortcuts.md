# iPhone Shortcuts

Three ways in, one for each situation:

| Way | How it travels | You provide |
|---|---|---|
| **Inbox** — automatic, recommended for bank messages | a file in `Budget/Inbox` | nothing but the message text |
| **SMS link** — automatic, for short messages only | `obsidian://finance-sms` | nothing but the message text |
| **Manual** — you tap it, for cash and anything with no SMS | `obsidian://finance-transaction` | the details, through prompts and dropdowns |

**Start with the inbox for bank SMS.** A link carries the message inside a URL, and that
has two ceilings nothing downstream can work around: iOS drops the link entirely when it
is the thing that launches Obsidian, and a long encoded message stops arriving at all. The
inbox has neither problem — see [The inbox way](#0-the-inbox-way-recommended) — and is the
only capture that cannot be lost while the app is closed.

Enable Finance Automation and restart Obsidian once before using either link, so the URL
handlers are registered.

---

## 0. The inbox way (recommended)

The automation saves the message as a file inside the vault. Nothing opens, nothing has to
be running, and there is no length limit — a file is a file. Obsidian turns every waiting
message into a transaction the next time it opens, and the phone can be asleep in between.

### Build it — four actions

1. Open **Shortcuts → Automation → +** and choose **Message**.
2. Tap **Sender** and pick the bank's sender name or number, then **Run Immediately →
   Next → New Blank Automation**.
3. Add **Text** and insert the **Shortcut Input** variable as its whole content. No URL
   encoding, no brackets, nothing else — the file holds the message exactly as it arrived.
4. Add **Save File**:
   - **Service**: On My iPhone
   - **Destination**: `Obsidian/⟨your vault⟩/Budget/Inbox`
   - turn **Ask Where to Save** *off*
   - leave **Overwrite If File Exists** off, so two messages in the same minute both survive
5. Tap **Done**.

Create the `Budget/Inbox` folder once from Obsidian, or from the Files app, before the
first run. Any `.txt`, `.md`, `.text` or `.log` file in it is treated as one message.

### What happens next

Obsidian reads the inbox on startup — even with **Run on startup** turned off, because
capturing a message is not the same as processing one — and on every processing pass. Each
file becomes a note with `status: pending` and the message in `sms_message` and the
**Original SMS** block, then the parser fills in the rest exactly as it does for a link.
The file is deleted only after its note is on disk, so a capture is never consumed without
a note to show for it. An empty file is left alone, and a file whose note could not be
written stays put for the next pass.

To pull the inbox in by hand, run **Import messages from the SMS inbox** from the command
palette.

---

## 1. The SMS way

The automation sends **only the message content**, URL-encoded. No sender, no date, no
other field. Everything else is read out of the message text inside Obsidian.

```text
obsidian://finance-sms?message=⟨the URL-encoded message⟩
```

The angle brackets stand for a Shortcuts variable chip and are never typed. Nor is any
bracket of any kind: `[` and `]` belong to IPv6 hosts in a URL, and a link carrying them
is malformed. One in the query is enough to lose the rest of the message.

### Build it — three actions

1. Open **Shortcuts → Automation → +** and choose **Message**.
2. Tap **Sender** and pick the bank's sender name or number. This is only the trigger
   condition — iOS needs one, and nothing about the sender is sent to Obsidian.
3. Choose **Run Immediately**, tap **Next**, then **New Blank Automation**.
4. Add **URL Encode** with **Shortcut Input** as its input — or **Content**, if the
   automation offers that instead.
5. Add **Text** and type the link, ending it at `message=`. Then insert the **URL Encoded
   Text** variable so the chip sits directly against the `=`, with nothing — no bracket,
   no space — between them:

   ```text
   obsidian://finance-sms?message=⟨URL Encoded Text⟩
   ```
6. Add **Open URLs** with that **Text** as its input.
7. Tap **Done**.

That is the whole automation. Nothing else belongs in it.

The **URL Encode** step is not optional. A raw space ends a link where it sits, so
`تم خصم 250 جنيه` opens as `obsidian://finance-sms?message=تم` and the note is created
with one word in it.

### What Obsidian reads out of the message

The note is created with `status: pending` and the full message stored in `sms_message`
and in the **Original SMS** block. Processing starts automatically a moment later and
fills in the rest from the text alone, using
`Budget/Settings/sms_patterns.json`:

| Field | Read from the message by |
|---|---|
| `amount`, `currency` | `amount_patterns`, falling back to `default_currency` in `config.json` |
| `from_account` / `to_account` | `card_ending_patterns` — the account or card number in the message, looked up in `card_endings` on the account notes in `Budget/Accounts/` |
| `transaction_type` | the `debit`, `credit`, `transfer`, and `fee` keyword lists |
| `merchant`, `recipient` or `sender` | `merchant_patterns`, `recipient_patterns`, `sender_patterns` — whichever the type calls for, plus the built-in patterns |
| `category` | the keyword rules in `Budget/Settings/Categories/` |
| `timestamp` | the date in the message when it carries one, otherwise the moment the link opened |

The account number is the hinge: list every digit group a bank uses for an account under
`card_endings` on its note in `Budget/Accounts/` and each message from that card files
itself. One account often has several — a debit card, a credit card, and the account
number all belong to the same note:

```yaml
name: "CIB"
card_endings:
  - "0779"
  - "1934"
aliases:
  - "cib"
```

`Budget/Settings/accounts.json` holds the same shape and still works for an account with
no note yet. Both sources are merged by name, so an ending listed in either one resolves
to the account.

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

### Who was on the other side

A note names the party under the key that says what it was, and only one of the three:

| Type | Key | What it holds |
|---|---|---|
| `debit`, `fee` | `merchant` | the shop or the biller |
| `transfer` | `recipient` | whoever the money went to |
| `credit` | `sender` | whoever the money came from |

Those come from `merchant_patterns`, `recipient_patterns` and `sender_patterns`, each of
which captures the name in a group called `name` (or the first unnamed group):

```json
{
  "merchant_patterns": [
    "(?i)(?:at|merchant)\\s+(?P<name>[A-Za-z0-9][A-Za-z0-9 .&'/_-]{1,60}?)(?=\\s+(?:on|using|balance)\\b|[.;,]|$)"
  ],
  "recipient_patterns": ["(?i)(?:إلى|الى|لحساب)\\s+(?P<name>[^.;,\\n]{2,60}?)(?=\\s+(?:في|الرصيد)|[.;,]|$)"]
}
```

A built-in set covering the common English and Arabic wordings runs after whatever the
file holds, so most banks need nothing here; a pattern of your own is always tried first.
The Arabic ones deliberately skip `من بطاقة` and `من حساب` — "from the card", "from the
account" — so the card a purchase left is never mistaken for a sender.

The names all appear together on the **Merchants** tab of the Budget view, where choosing
a category files every transaction of that name and teaches the keyword rules to file the
next one on its own.

### What arrives, and what the note shows

The note shows the message as the bank wrote it. When a link hands the plugin text that
is still in its encoded spelling — `%D8%AA%D9%85` rather than `تم` — the plugin decodes it
before writing, so `sms_message` and the **Original SMS** block hold the original either
way.

Two older hazards are handled too. A literal `&` or `#` in an unencoded message ends the
`message` parameter early; the plugin glues the stray parameters Obsidian splits off back
on in the order received. And a link cut off mid-escape leaves text that cannot be
decoded; the plugin decodes as far as the cut and keeps the remainder as it came, rather
than losing the whole message.

### The length of a link

A message travels inside the URL, and encoding is expensive: one Arabic letter costs six
characters. A long bank SMS can run to several hundred characters encoded, and a link that
is cut short arrives short — nothing downstream can recover text that was never sent. If
notes are arriving truncated at the same length every time, that ceiling is what you are
hitting.

---

## 2. The manual way

A Shortcut you run yourself — from the Shortcuts app, a Home Screen icon, or a widget —
when there is no SMS to work from. It asks for the details and sends them already
separated, so Obsidian stores them without parsing anything.

```text
obsidian://finance-transaction?amount=⟨Amount⟩&currency=⟨Currency⟩&account=⟨Account⟩&type=⟨Type⟩&merchant=⟨Encoded merchant⟩
```

### Build it

1. In the **Shortcuts** tab, tap **+** and name it something like *Add Transaction*.
2. Add **Ask for Input**. Set **Input Type** to **Number** and the prompt to `Amount`.
3. Add **Choose from Menu** with the prompt `Currency` and one item per currency:
   `EGP`, `USD`, `EUR`. Each branch does nothing — the chosen item is the value you use.
4. Add **Choose from Menu** with the prompt `Account` and one item per account, spelled
   exactly as the `name` on its note in `Budget/Accounts/`. Write a space as `%20`, so
   `CIB Visa` becomes `CIB%20Visa`.
5. Add **Choose from Menu** with the prompt `Type` and four items: `debit`, `credit`,
   `transfer`, `fee`.
6. Add **Ask for Input** with **Text** and the prompt `Merchant` — or skip this step and
   step 7 if you do not want to be asked.
7. Add **URL Encode** with that text as its input. This one is needed: a merchant you
   type by hand can contain anything.
8. Add **Text** and build the link with the chosen values, each angle-bracketed name
   standing for a variable chip you insert rather than characters you type:

   ```text
   obsidian://finance-transaction?amount=⟨Amount⟩&currency=⟨Currency⟩&account=⟨Account⟩&type=⟨Type⟩&merchant=⟨URL Encoded Text⟩
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
| `merchant` | `merchant`, `recipient` or `sender` | Optional; `recipient`, `sender` and `counterparty` are accepted as the same parameter, and the type decides which key the name is written under |
| `category` | `category` | Optional; defaults to `Uncategorized` |
| `timestamp` | `timestamp` | Optional ISO 8601; the current time is used when omitted |

For a transfer, replace `account` with `from` and `to`.

Keep the **URL Encode** step for any value you type by hand. Fixed dropdown values are
safe as long as you write their spaces as `%20`.

---

## When something does not land

| Symptom | Cause |
|---|---|
| **Black screen and no note, only from the Shortcut** | The link is too long, or it is the thing launching Obsidian. Obsidian never reads the URL iOS launched it with, and a long encoded message stops arriving. Use the inbox. |
| Nothing happens when the link opens | Plugin not enabled, or Obsidian not restarted since installing it |
| Inbox file never becomes a note | The file has an extension other than `.txt`, `.md`, `.text` or `.log`, or Save File wrote it outside `Budget/Inbox` |
| Note appears but stays `pending` | Processing has not run yet; run **Process pending SMS transactions** |
| `needs_review` with no account | The card digits are missing from `card_endings`, or the bank's wording is not in `card_ending_patterns` |
| SMS note holds only the first word | The automation has no **URL Encode** action, so a space ended the link |
| SMS text cut off at the same length every time | The link is running into a length ceiling — see above |
| Manual note has a mangled account | A space in a dropdown value was not written as `%20` |
| Message starts with `[` or is cut off after it | A bracket was typed around a variable chip; the link is malformed |

If the phone holds more than one vault, open the finance vault once: the link is handled
by the vault Obsidian has open.

## Privacy

The links open the installed Obsidian app. Finance Automation writes and parses the
transaction inside the vault and makes no network requests.
