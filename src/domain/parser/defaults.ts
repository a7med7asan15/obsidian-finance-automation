import type { SmsPatterns } from "./sms.ts";

/**
 * Built-in patterns for the party a message names, in the Python flavour
 * `Budget/Settings/sms_patterns.json` uses. They exist because a bank writes
 * the name in a handful of shapes that are the same for everyone, while the
 * amount and the card number differ enough that those stay the vault's
 * business. Patterns from the vault are tried first, so an entry here never
 * overrules one written by hand — it only catches what the vault file misses.
 *
 * The Arabic entries avoid `\b`, which only knows ASCII word characters and so
 * never matches at the edge of an Arabic word.
 */
export const DEFAULT_PARTY_PATTERNS: Required<
  Pick<SmsPatterns, "merchant_patterns" | "recipient_patterns" | "sender_patterns">
> = {
  merchant_patterns: [
    "(?i)(?:at|merchant)\\s+(?P<name>[A-Za-z0-9][A-Za-z0-9 .&'/_-]{1,60}?)(?=\\s+(?:on|using|with|via|balance|available|ref|reference|date)\\b|[.;,]|$)",
    "(?i)(?:عند|لدى|من\\s+محل)\\s+(?P<name>[^.;,\\n]{2,60}?)(?=\\s+(?:في|بتاريخ|الرصيد|مرجع|بواسطة|باستخدام)|[.;,]|$)",
  ],
  recipient_patterns: [
    "(?i)\\bto\\s+(?!your\\b|the\\b|a/c\\b|acct\\b|account\\b|card\\b|wallet\\b)(?P<name>[A-Za-z0-9][A-Za-z0-9 .&'/_-]{1,60}?)(?=\\s+(?:on|using|with|via|from|balance|available|ref|reference|date)\\b|[.;,]|$)",
    "(?i)(?:إلى|الى|لحساب|لصالح)\\s+(?!بطاقة|حساب|رقم)(?P<name>[^.;,\\n]{2,60}?)(?=\\s+(?:في|بتاريخ|الرصيد|مرجع|بواسطة|باستخدام)|[.;,]|$)",
  ],
  sender_patterns: [
    "(?i)\\bfrom\\s+(?!your\\b|the\\b|a/c\\b|acct\\b|account\\b|card\\b|wallet\\b)(?P<name>[A-Za-z0-9][A-Za-z0-9 .&'/_-]{1,60}?)(?=\\s+(?:on|using|with|via|to|balance|available|ref|reference|date)\\b|[.;,]|$)",
    "(?i)من\\s+(?!بطاقة|حساب|رقم|خلال)(?P<name>[^.;,\\n]{2,60}?)(?=\\s+(?:في|بتاريخ|الرصيد|مرجع|إلى|الى|بواسطة|باستخدام)|[.;,]|$)",
  ],
};

/**
 * The vault's patterns with the built-in party patterns appended. Only the three
 * party lists are topped up: everything else is left exactly as the vault has
 * it, so an amount or a card pattern removed by hand stays removed.
 */
export function withDefaultPatterns(patterns: SmsPatterns): SmsPatterns {
  const merged: SmsPatterns = { ...patterns };
  for (const [key, defaults] of Object.entries(DEFAULT_PARTY_PATTERNS)) {
    const own = (patterns as Record<string, string[] | undefined>)[key] ?? [];
    (merged as Record<string, string[]>)[key] = [
      ...own,
      ...defaults.filter((pattern) => !own.includes(pattern)),
    ];
  }
  return merged;
}
