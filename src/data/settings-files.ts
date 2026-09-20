import {
  ACCOUNTS_CONFIG_PATH,
  ACCOUNTS_DIR,
  CATEGORY_RULES_PATH,
  CONFIG_PATH,
  RULES_PATH,
  SMS_PATTERNS_PATH,
} from "../constants.ts";
import type { CategoryRules } from "../domain/categorize.ts";

/**
 * The categories a new vault starts with, and the words that file a message
 * into each of them.
 *
 * Keywords are matched against the whole message, case-insensitively, so every
 * word here is a name a bank would only print because that is who was paid.
 * Generic banking words — `fee`, `transfer`, `payment` — are deliberately
 * absent: they appear in the boilerplate of messages that have nothing to do
 * with the category, and the first matching rule wins.
 */
export const DEFAULT_CATEGORIES: Array<{ name: string; keywords: string[] }> = [
  {
    name: "Groceries",
    keywords: ["carrefour", "spinneys", "seoudi", "gourmet", "kazyon", "hyper one", "supermarket"],
  },
  {
    name: "Dining",
    keywords: ["talabat", "elmenus", "starbucks", "mcdonald", "kfc", "pizza", "cilantro", "costa", "restaurant"],
  },
  {
    name: "Transport",
    keywords: ["uber", "careem", "swvl", "chillout", "wataniya", "mobil", "taxi", "petrol"],
  },
  {
    name: "Bills",
    keywords: ["fawry", "electricity", "water bill", "gas bill", "internet", "كهرباء", "فاتورة"],
  },
  {
    name: "Shopping",
    keywords: ["amazon", "noon", "jumia", "ikea", "zara", "h&m"],
  },
  {
    name: "Health",
    keywords: ["pharmacy", "el ezaby", "seif", "roshdy", "hospital", "clinic", "صيدلية"],
  },
  {
    name: "Entertainment",
    keywords: ["netflix", "spotify", "anghami", "cinema", "playstation", "youtube"],
  },
  {
    name: "Salary",
    keywords: ["salary", "payroll", "راتب"],
  },
];

export const DEFAULT_CATEGORY_RULES: CategoryRules = {
  rules: DEFAULT_CATEGORIES.map((category) => ({
    category: category.name,
    keywords: [...category.keywords],
  })),
};

export interface SettingsFile {
  /** Where the note lives. */
  path: string;
  /** The prose above the data block, written once when the file is created. */
  intro: string;
  /** What the block holds on a vault that has never been configured. */
  content: unknown;
}

const heading = (title: string, body: string): string => `# ${title}\n\n${body.trim()}\n`;

/**
 * Every settings file the plugin reads, with the words that explain it and the
 * contents it starts as. `ensureWorkspace` writes them all on a fresh vault, so
 * the settings are something you can open and read rather than something you
 * have to know exists; `saveVaultJson` uses the same intro when a save is what
 * creates the file.
 */
export const SETTINGS_FILES: SettingsFile[] = [
  {
    path: CONFIG_PATH,
    content: { default_currency: "EGP" },
    intro: heading(
      "Budget config",
      `The currency a message is read as when it names an amount but no currency —
which is most of them. Use the three-letter code your bank writes.`,
    ),
  },
  {
    path: ACCOUNTS_CONFIG_PATH,
    content: { accounts: [] },
    intro: heading(
      "Accounts (fallback)",
      `The notes in \`${ACCOUNTS_DIR}/\` are where accounts live: one note each, holding the
card endings and aliases the parser matches a message against. This file is the
fallback for an account you would rather not give a note, and it is empty until
you write one here. Entries in both places are merged, so an ending listed
either way files a message to the same account.

An entry takes this shape:

\`\`\`text
{ "name": "Wallet", "currency": "EGP", "card_endings": ["5678"], "aliases": ["vf cash"] }
\`\`\``,
    ),
  },
  {
    path: SMS_PATTERNS_PATH,
    content: {
      amount_patterns: [],
      card_ending_patterns: [],
      date_patterns: [],
      merchant_patterns: [],
      recipient_patterns: [],
      sender_patterns: [],
      transaction_keywords: [],
      debit_keywords: [],
      credit_keywords: [],
      transfer_keywords: [],
      fee_keywords: [],
    },
    intro: heading(
      "Parser patterns",
      `Every list here is empty because every one of them is built in already: a vault
that never touches this file still reads an amount, a card ending, a date, a
name and the direction of the money, in English and in Arabic.

Add to a list only when your bank says something the built-ins miss. What you
write is always tried first, and the patterns use Python's flavour of regular
expressions — \`(?i)\` for case-insensitive, \`(?P<name>...)\` for a named group.
The groups each list must capture are in the README.`,
    ),
  },
  {
    path: RULES_PATH,
    content: { rules: [] },
    intro: heading(
      "Exclusion rules",
      `Rules that keep a transaction out of every total — a reversal, a transfer
between your own accounts, a duplicate message. Excluding a transaction by hand
always beats a rule.

Edit these under **Settings → Ultra Budget Tracker → Edit rules** rather than
here; the editor writes this block back in the shape it expects.`,
    ),
  },
  {
    path: CATEGORY_RULES_PATH,
    content: DEFAULT_CATEGORY_RULES,
    intro: heading(
      "Category rules",
      `The first keyword found in a message decides its category, matched anywhere in
the text and case-insensitively. The list below is a starting point — the names
a bank in Egypt tends to print — and it is meant to be edited.

You rarely have to: naming a merchant on the **Merchants** tab of the Budget
view files every transaction of that name and writes the keyword here, so the
next message files itself.`,
    ),
  },
];

const BY_PATH = new Map(SETTINGS_FILES.map((file) => [file.path, file]));

/** The prose a settings note is created with, or a plain heading for anything else. */
export function introFor(path: string): string {
  const known = BY_PATH.get(path);
  if (known) return known.intro;
  const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
  return `# ${name}\n`;
}
