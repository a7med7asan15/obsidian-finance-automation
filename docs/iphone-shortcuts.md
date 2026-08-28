# iPhone Shortcuts

Finance Automation 2.1.0 and newer registers two `obsidian://` actions. Both create normal transaction notes under `Transactions/YYYY/Mon/` and trigger the existing report refresh.

Enable Finance Automation and restart Obsidian once before opening either kind of link.

## Capture a raw SMS

Use this action when the message contains the transaction details:

```text
obsidian://finance-sms?message=[Encoded SMS]&timestamp=[Encoded ISO date]
```

Example:

```text
obsidian://finance-sms?message=Card%201234%20purchase%20amount%20EGP%20120.50%20at%20Carrefour&timestamp=2026-08-29T14%3A35%3A02%2B03%3A00
```

The note starts with `status: pending`. Finance Automation parses the message locally, fills the fields it recognizes, and changes the status to `parsed` or `needs_review`.

### Shortcut automation

1. Open **Shortcuts → Automation → + → Message**.
2. Choose the bank as **Sender** and select **Run Immediately**.
3. Get the message **Content** from the incoming Shortcut Input.
4. URL-encode the message content.
5. Get **Current Date**, format it as ISO 8601, and URL-encode it.
6. Insert those variables in the `finance-sms` URL.
7. Add **Open URLs**.

Always URL-encode dynamic values. In particular, an unencoded `&`, `+`, or `#` can change the meaning of the link.

## Capture structured fields

Use this action when the Shortcut or another app already has the individual values:

```text
obsidian://finance-transaction?amount=[Amount]&currency=[Currency]&account=[Encoded account]&type=[Type]&timestamp=[Encoded ISO date]
```

Example:

```text
obsidian://finance-transaction?amount=120.50&currency=EGP&account=Visa%201234&type=debit&merchant=Carrefour&category=Groceries&timestamp=2026-08-29T14%3A35%3A02%2B03%3A00
```

| Parameter | Property | Details |
|---|---|---|
| `amount` | `amount` | Number; grouping commas are accepted |
| `currency` | `currency` | For example `EGP`, `USD`, or `EUR` |
| `account` | `from_account` or `to_account` | Becomes the destination for a credit; otherwise the source |
| `type` | `transaction_type` | `debit`, `credit`, `transfer`, or `fee` |
| `from` | `from_account` | Optional explicit source account |
| `to` | `to_account` | Optional explicit destination account |
| `merchant` | `merchant` | Optional |
| `category` | `category` | Optional; defaults to `Uncategorized` |
| `message` | `sms_message` | Optional original SMS |
| `timestamp` | `timestamp` | Optional ISO 8601 date; current time is used when omitted |

Use explicit `from` and `to` parameters for transfers. The transaction is marked `parsed` when amount, currency, a valid type, and an account are present. Incomplete transactions are marked `needs_review`.

### Manual structured Shortcut

1. Ask for a numeric amount.
2. Choose a currency from a list.
3. Choose an account from a list.
4. Choose `debit`, `credit`, `transfer`, or `fee`.
5. Get the current date and format it as ISO 8601.
6. URL-encode each dynamic text value.
7. Insert the variables into the `finance-transaction` URL.
8. Add **Open URLs**.

## Privacy

The links open the installed Obsidian app. Finance Automation writes and processes the transaction inside the vault and makes no network requests.
