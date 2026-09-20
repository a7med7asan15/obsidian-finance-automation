/**
 * Settings/sms_patterns.md uses Python-flavoured regular expressions, because
 * the original processor was Python. That file is user-editable, so the
 * translation stays rather than migrating the file.
 */
export function makeRegex(pattern: string): RegExp {
  const translated = pattern
    .replace(/^\(\?i\)/, "")
    .replace(/\(\?P<([A-Za-z_][A-Za-z0-9_]*)>/g, "(?<$1>");
  return new RegExp(translated, "iu");
}

export function extractByPatterns(text: string, patterns: string[] | undefined): RegExpMatchArray | null {
  for (const pattern of patterns ?? []) {
    let regex: RegExp;
    try {
      regex = makeRegex(pattern);
    } catch (error) {
      throw new Error(`Invalid SMS pattern ${pattern}: ${(error as Error).message}`);
    }
    const match = text.match(regex);
    if (match) return match;
  }
  return null;
}

/**
 * The spelling two keywords have in common.
 *
 * A bank writes the same Arabic word several ways — `إلى حسابك`, `الى حسابك`
 * and `الي حسابك` are one phrase — and it pads a message with runs of spaces,
 * so a keyword typed one way has to match a message written another. The alef
 * and yaa families are folded together, taa marbuta joins haa, the marks a
 * message may carry are dropped, and every run of whitespace becomes one space.
 * Both sides of a comparison go through this, so a keyword can be written
 * whichever way reads best.
 */
export function foldForMatch(text: string): string {
  return String(text ?? "")
    .toLocaleLowerCase()
    .replace(/[ً-ْـ]/gu, "")
    .replace(/[أإآٱ]/gu, "ا")
    .replace(/[ىی]/gu, "ي")
    .replace(/ة/gu, "ه")
    .replace(/\s+/gu, " ")
    .trim();
}

export function hasKeyword(text: string, keywords: string[] | undefined): boolean {
  const folded = foldForMatch(text);
  return (keywords ?? []).some((word) => {
    const needle = foldForMatch(word);
    return Boolean(needle) && folded.includes(needle);
  });
}
