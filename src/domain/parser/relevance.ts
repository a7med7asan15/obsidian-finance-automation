import { hasKeyword } from "./patterns.ts";
import type { SmsPatterns } from "./sms.ts";

/**
 * The wordings that mark a message as money actually moving, rather than a bank
 * talking about money.
 *
 * A phone's bank thread is mostly not transactions: statement reminders, due
 * dates, one-time codes, offers. They carry amounts and card numbers, so the
 * amount and card patterns match them happily, and a reminder to pay a minimum
 * of `1 جم` becomes a 1 EGP transaction that never happened. What separates a
 * real one is that the bank says the money left an account or arrived in one —
 * `تم خصم`, `من حسابك`, `إلى حسابك`, `charged`, `debited`, `credited` — so that
 * is what a message has to say before it is worth parsing.
 *
 * Matching folds Arabic spelling variants (see `foldForMatch`), so `إلى حسابك`
 * here also catches `الى حسابك` and `الي حسابك`. Keep each entry long enough to
 * be about an account: `بطاقتك` on its own would match the reminder's
 * `بطاقتكم`, which is the message this list exists to keep out.
 */
export const DEFAULT_TRANSACTION_KEYWORDS: string[] = [
  // Money leaving.
  "تم خصم",
  "خصم من حسابك",
  "من حسابك",
  "من بطاقتك",
  "تم سحب",
  "سحب من حسابك",
  "تم شراء",
  "تم دفع",
  "from your account",
  "from your card",
  "charged",
  "debited",
  "withdrawn",
  "withdrawal",
  "purchase",
  // Money arriving.
  "إلى حسابك",
  "لحسابك",
  "تم إيداع",
  "تم اضافة",
  "to your account",
  "to your card",
  "credited",
  "deposited",
  "refunded",
  // Either way.
  "تم تنفيذ تحويل",
  "تم تحويل",
  "transferred",
];

/**
 * Whether a captured message is worth turning into a transaction at all.
 *
 * The vault's own `transaction_keywords` are used when it lists any, with the
 * built-in ones appended by `withDefaultPatterns`; a caller that skipped that
 * merge still gets the built-in list rather than a gate that passes everything.
 */
export function isTransactionMessage(sms: string, patterns: SmsPatterns = {}): boolean {
  const keywords = patterns.transaction_keywords?.length
    ? patterns.transaction_keywords
    : DEFAULT_TRANSACTION_KEYWORDS;
  return hasKeyword(sms, keywords);
}
