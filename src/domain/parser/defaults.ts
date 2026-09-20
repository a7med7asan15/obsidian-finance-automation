import { DEFAULT_TRANSACTION_KEYWORDS } from "./relevance.ts";
import type { SmsPatterns } from "./sms.ts";

/**
 * Built-in patterns for the party a message names, in the Python flavour
 * `Budget/Settings/sms_patterns.md` uses. They exist because a bank writes
 * the name in a handful of shapes that are the same for everyone, while the
 * amount and the card number differ enough that those stay the vault's
 * business. Patterns from the vault are tried first, so an entry here never
 * overrules one written by hand — it only catches what the vault file misses.
 *
 * The Arabic entries avoid `\b`, which only knows ASCII word characters and so
 * never matches at the edge of an Arabic word.
 *
 * The Latin name class carries `*`, `+` and `#` because a card network writes
 * them into the descriptor itself — `ANTHROPIC* CLAUDE SUB`, `STORE #1234`. The
 * name is matched lazily up to a terminator, so a character the class omits
 * does not merely truncate the name: the whole pattern fails there and the
 * message lands with no merchant at all.
 */
export const DEFAULT_PARTY_PATTERNS: Required<
  Pick<SmsPatterns, "merchant_patterns" | "recipient_patterns" | "sender_patterns">
> = {
  merchant_patterns: [
    "(?i)(?:at|merchant)\\s+(?P<name>[A-Za-z0-9][A-Za-z0-9 .&'/_*+#-]{1,60}?)(?=\\s+(?:on|using|with|via|balance|available|ref|reference|date)\\b|[.;,]|$)",
    "(?i)(?:عند|لدى|من\\s+محل)\\s+(?P<name>[^.;,\\n]{2,60}?)(?=\\s+(?:في|بتاريخ|الرصيد|مرجع|بواسطة|باستخدام)|[.;,]|$)",
  ],
  recipient_patterns: [
    "(?i)\\bto\\s+(?!your\\b|the\\b|a/c\\b|acct\\b|account\\b|card\\b|wallet\\b)(?P<name>[A-Za-z0-9][A-Za-z0-9 .&'/_*+#-]{1,60}?)(?=\\s+(?:on|using|with|via|from|balance|available|ref|reference|date)\\b|[.;,]|$)",
    "(?i)(?:إلى|الى|لحساب|لصالح)\\s+(?!بطاقة|حساب|رقم)(?P<name>[^.;,\\n]{2,60}?)(?=\\s+(?:في|بتاريخ|الرصيد|مرجع|بواسطة|باستخدام)|[.;,]|$)",
  ],
  sender_patterns: [
    "(?i)\\bfrom\\s+(?!your\\b|the\\b|a/c\\b|acct\\b|account\\b|card\\b|wallet\\b)(?P<name>[A-Za-z0-9][A-Za-z0-9 .&'/_*+#-]{1,60}?)(?=\\s+(?:on|using|with|via|to|balance|available|ref|reference|date)\\b|[.;,]|$)",
    "(?i)من\\s+(?!بطاقة|حساب|رقم|خلال)(?P<name>[^.;,\\n]{2,60}?)(?=\\s+(?:في|بتاريخ|الرصيد|مرجع|إلى|الى|بواسطة|باستخدام)|[.;,]|$)",
  ],
};

/**
 * Built-in keywords that decide the direction of the money. Like the party
 * patterns, these are the wordings every bank shares rather than the ones a
 * particular vault has to spell out. `من حسابك` ("from your account") and
 * `تم خصم` ("was deducted") both mean money left, so either one on its own is
 * enough to read a message as spending; `إلى حسابك` ("to your account") is the
 * same sentence pointing the other way, so it reads as money arriving.
 *
 * A transfer still wins over either — `parseSms` checks the transfer keywords
 * first — so "تم تحويل 500 من حسابك إلى ..." stays a transfer rather than
 * becoming spending. The two lists are not wasted on it: which of them the
 * message matched is what puts your account on the paying or the receiving
 * side of that transfer.
 */
export const DEFAULT_KEYWORDS: Required<
  Pick<
    SmsPatterns,
    | "debit_keywords"
    | "credit_keywords"
    | "transfer_keywords"
    | "fee_keywords"
    | "transaction_keywords"
  >
> = {
  /**
   * The account phrases, plus the plain verbs a bank uses when it does not name
   * the account at all — `was debited`, `was charged`. Those verbs already sit
   * in DEFAULT_TRANSACTION_KEYWORDS, which sorts them into money leaving and
   * money arriving; without them repeated here a card purchase passes the gate
   * and then parses with no direction, so the note lands as `pending`.
   *
   * Left out on purpose: `paid` and `payment`, which `hasKeyword` would find
   * inside `prepaid` and inside `payment received` — a credit.
   */
  debit_keywords: [
    "من حسابك", "من بطاقتك", "تم خصم", "تم سحب", "تم شراء", "تم دفع",
    "from your account", "from your card",
    "debited", "charged", "purchase", "withdrawn", "withdrawal",
  ],
  credit_keywords: [
    "إلى حسابك", "لحسابك", "تم إيداع", "تم اضافة",
    "to your account", "to your card",
    "credited", "deposited", "refunded",
  ],
  transfer_keywords: ["transfer", "transferred", "تحويل", "تم تنفيذ تحويل"],
  /**
   * Every entry here is long enough to be about a fee. `hasKeyword` matches a
   * plain substring, so a bare "fee" would read `COFFEE SHOP` as a bank charge —
   * and because a fee outranks a debit in `parseSms`, every coffee would stop
   * being spending and become a fee.
   */
  fee_keywords: [
    "fees",
    "service fee",
    "monthly fee",
    "annual fee",
    "late fee",
    "atm fee",
    "commission",
    "عمولة",
    "رسوم",
    "مصاريف",
  ],
  transaction_keywords: DEFAULT_TRANSACTION_KEYWORDS,
};

/**
 * Built-in patterns for the amount and the card ending — the two the parser
 * cannot do without. A message with no amount is not a transaction anyone can
 * use, and an ending nothing matches leaves the note filed to no account, so a
 * vault that never wrote `Budget/Settings/sms_patterns.md` would otherwise
 * park every capture as `pending` at 25% confidence.
 *
 * Unlike the lists above these are a **fallback, not a top-up**: they apply
 * only when the vault lists none of their own. `withDefaultPatterns` says why.
 */
export const DEFAULT_MATCH_PATTERNS: Required<
  Pick<SmsPatterns, "amount_patterns" | "card_ending_patterns">
> = {
  amount_patterns: [
    "(?i)(?:amount|amt|مبلغ)\\s*[:=-]?\\s*(?:(?P<currency1>EGP|USD|EUR|GBP|SAR|AED|ج\\.?م)\\s*)?(?P<amount>[0-9][0-9,]*(?:\\.[0-9]{1,2})?)(?:\\s*(?P<currency2>EGP|USD|EUR|GBP|SAR|AED|ج\\.?م))?",
    "(?i)(?P<currency1>EGP|USD|EUR|GBP|SAR|AED|ج\\.?م)\\s*(?P<amount>[0-9][0-9,]*(?:\\.[0-9]{1,2})?)",
    "(?i)(?P<amount>[0-9][0-9,]*(?:\\.[0-9]{1,2})?)\\s*(?P<currency2>EGP|USD|EUR|GBP|SAR|AED|ج\\.?م)",
  ],
  // The Arabic entry spells out the possessive forms too. A bank writes
  // `من بطاقتك` and `من حسابك` — the same wordings DEFAULT_KEYWORDS reads as a
  // debit — and `بطاقة` alone matches neither, so the ending went unread and
  // the note was filed to no account at all.
  card_ending_patterns: [
    "(?i)(?:card|acct|account|a/c|ending|xx+|\\*+)\\s*(?:no\\.?|number)?\\s*[:#-]?\\s*(?P<ending>[0-9]{4})\\b",
    "(?i)(?:بطاقتكم|بطاقتك|بطاقة|حسابكم|حسابك|حساب)\\s*(?:رقم)?\\s*[:#-]?\\s*(?P<ending>[0-9]{4})\\b",
  ],
};

/**
 * Built-in date patterns, for the same reason the party patterns exist: a bank
 * writes the date in a couple of shapes that are the same for everyone, and a
 * vault that never wrote a `date_patterns` list would otherwise file every
 * capture under the moment it was pasted rather than the moment it happened.
 *
 * Two readings only. The ISO one leads, because a four-digit year in front is
 * unambiguous. The other is **day first** — `08-09-2026` is the eighth of
 * September — which is what Egyptian banks write and what the rest of this
 * plugin assumes. A bank that writes month first has to say so in
 * `Budget/Settings/sms_patterns.md`, where its pattern is tried ahead of
 * these. Its year takes either shape — `19/09/2026` and `19/09/26` are the same
 * day — with the four-digit reading tried first so it is never cut short;
 * `extractTimestamp` is what turns the short one back into a full year.
 *
 * The word boundaries keep a card or reference number from being read as a date
 * — there is no boundary between two digits, so `4012-3456-7890` matches
 * nothing. They are boundaries rather than lookbehinds because a lookbehind
 * throws on iOS before 16.4, which is a phone this plugin runs on. The time is optional and 24-hour; `extractTimestamp` defaults a missing
 * one to midnight Cairo, so a message that only carries a day still lands on
 * the right day. A 12-hour time is left to the vault file — there is no group
 * here that could carry the am/pm back.
 */
export const DEFAULT_DATE_PATTERNS: Required<Pick<SmsPatterns, "date_patterns">> = {
  date_patterns: [
    "(?i)\\b(?P<year>[0-9]{4})-(?P<month>[0-9]{1,2})-(?P<day>[0-9]{1,2})\\b(?:[ T]+(?P<hour>[0-9]{1,2}):(?P<minute>[0-9]{2})(?::(?P<second>[0-9]{2}))?)?",
    "(?i)\\b(?P<day>[0-9]{1,2})[-/.](?P<month>[0-9]{1,2})[-/.](?P<year>[0-9]{4}|[0-9]{2})\\b(?:\\s+(?:at\\s+|الساعة\\s+)?(?P<hour>[0-9]{1,2}):(?P<minute>[0-9]{2})(?::(?P<second>[0-9]{2}))?)?",
  ],
};

/**
 * The vault's patterns with the built-in lists filled in, so the plugin parses
 * a message on a vault that has no `Budget/Settings/sms_patterns.md` at all —
 * which is every fresh install.
 *
 * Two kinds of filling in, and the difference matters:
 *
 * - **Topped up** — the party patterns, the direction keywords and the date
 *   patterns are appended to whatever the vault wrote, vault first. These only
 *   ever widen what is understood, so adding to them cannot break a message the
 *   vault already read.
 * - **Fallen back on** — the amount and card-ending patterns are used only when
 *   the vault lists none. Order decides which amount in a message wins, so
 *   appending to a hand-written list would change what an existing vault reads;
 *   a pattern deliberately removed from that file therefore stays removed. This
 *   is the same rule `isTransactionMessage` already applies to the keywords that
 *   gate a message.
 */
export function withDefaultPatterns(patterns: SmsPatterns): SmsPatterns {
  const merged: SmsPatterns = { ...patterns };

  const toppedUp = { ...DEFAULT_PARTY_PATTERNS, ...DEFAULT_KEYWORDS, ...DEFAULT_DATE_PATTERNS };
  for (const [key, defaults] of Object.entries(toppedUp)) {
    const own = (patterns as Record<string, string[] | undefined>)[key] ?? [];
    (merged as Record<string, string[]>)[key] = [
      ...own,
      ...defaults.filter((pattern) => !own.includes(pattern)),
    ];
  }

  for (const [key, defaults] of Object.entries(DEFAULT_MATCH_PATTERNS)) {
    const own = (patterns as Record<string, string[] | undefined>)[key] ?? [];
    (merged as Record<string, string[]>)[key] = own.length ? own : [...defaults];
  }

  return merged;
}
