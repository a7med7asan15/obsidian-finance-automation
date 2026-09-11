export interface CategoryRules {
  rules: Array<{ category: string; keywords: string[] }>;
}

export function categorize(text: string, rules: CategoryRules): string {
  const folded = String(text ?? "").toLocaleLowerCase();
  for (const rule of rules.rules ?? []) {
    const keywords = rule.keywords ?? [];
    if (keywords.some((word) => folded.includes(String(word).toLocaleLowerCase()))) {
      return rule.category || "Uncategorized";
    }
  }
  return "Uncategorized";
}
