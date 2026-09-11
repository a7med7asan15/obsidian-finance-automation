/**
 * Settings/sms_patterns.json uses Python-flavoured regular expressions, because
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

export function hasKeyword(text: string, keywords: string[] | undefined): boolean {
  const folded = text.toLocaleLowerCase();
  return (keywords ?? []).some((word) => folded.includes(String(word).toLocaleLowerCase()));
}
