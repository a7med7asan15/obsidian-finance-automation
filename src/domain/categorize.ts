import { noteNameProblem, sameName } from "./names.ts";

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

/**
 * The rules with `keyword` filed under `category` and removed from every other
 * one, so a name never matches two categories and the first rule wins by
 * accident. A category with no rule yet gains one. Comparison is
 * case-insensitive, and the keyword is stored as given.
 *
 * This is what makes categorising a merchant stick: naming it once here files
 * every message that mentions it from then on, without a second visit to the
 * list.
 */
export function withKeyword(
  rules: CategoryRules,
  category: string,
  keyword: string,
): CategoryRules {
  const name = String(category ?? "").trim();
  const word = String(keyword ?? "").trim();
  if (!name || !word) return { rules: [...(rules.rules ?? [])] };
  const folded = word.toLocaleLowerCase();

  const next = (rules.rules ?? []).map((rule) => ({
    category: rule.category,
    keywords: (rule.keywords ?? []).filter(
      (existing) => String(existing).trim().toLocaleLowerCase() !== folded,
    ),
  }));

  const target = next.find((rule) => sameName(rule.category, name));
  if (target) target.keywords.push(word);
  else next.push({ category: name, keywords: [word] });

  return { rules: next };
}

/**
 * The rules with `category`'s keyword list replaced wholesale, and every word
 * in it removed from the other categories, so a word still names one category
 * only. Blank words are dropped and repeats collapse, both case-insensitively;
 * a word is stored as it was typed.
 *
 * An empty list leaves the category with a rule and no words rather than
 * dropping the rule, so a category that deliberately matches nothing stays that
 * way instead of reappearing empty on the next edit.
 */
export function withKeywords(
  rules: CategoryRules,
  category: string,
  keywords: string[],
): CategoryRules {
  const name = String(category ?? "").trim();
  if (!name) return { rules: [...(rules.rules ?? [])] };

  const kept: string[] = [];
  const seen = new Set<string>();
  for (const raw of keywords ?? []) {
    const word = String(raw ?? "").trim();
    const folded = word.toLocaleLowerCase();
    if (!word || seen.has(folded)) continue;
    seen.add(folded);
    kept.push(word);
  }

  const next = (rules.rules ?? []).map((rule) => ({
    category: rule.category,
    keywords: sameName(rule.category, name)
      ? kept
      : (rule.keywords ?? []).filter(
          (existing) => !seen.has(String(existing).trim().toLocaleLowerCase()),
        ),
  }));

  if (!next.some((rule) => sameName(rule.category, name))) {
    next.push({ category: name, keywords: kept });
  }
  return { rules: next };
}

/**
 * The rules with `from` renamed to `into`. Two rules under one name would leave
 * the second unreachable, since the first match wins, so a rule that already
 * carries the new name absorbs the keywords instead of sitting beside it.
 */
export function renamedCategory(
  rules: CategoryRules,
  from: string,
  into: string,
): CategoryRules {
  const before = String(from ?? "").trim();
  const after = String(into ?? "").trim();
  if (!before || !after || sameName(before, after)) return { rules: [...(rules.rules ?? [])] };

  const next: Array<{ category: string; keywords: string[] }> = [];
  for (const rule of rules.rules ?? []) {
    const isMoving = sameName(rule.category, before);
    const target = next.find((entry) => sameName(entry.category, after));
    if (isMoving || sameName(rule.category, after)) {
      if (target) target.keywords.push(...(rule.keywords ?? []));
      else next.push({ category: after, keywords: [...(rule.keywords ?? [])] });
    } else {
      next.push({ category: rule.category, keywords: [...(rule.keywords ?? [])] });
    }
  }
  return { rules: next };
}

/** The rules without `category`, so nothing files itself under a name that is gone. */
export function withoutCategory(rules: CategoryRules, category: string): CategoryRules {
  const name = String(category ?? "").trim();
  if (!name) return { rules: [...(rules.rules ?? [])] };
  return { rules: (rules.rules ?? []).filter((rule) => !sameName(rule.category, name)) };
}

/**
 * The reason `name` cannot be a category, or null when it can. `existing` holds
 * the names already taken; a category being renamed passes its own name as
 * `current` so keeping it is not read as a clash.
 */
export function categoryNameProblem(
  name: string,
  existing: string[],
  current = "",
): string | null {
  return noteNameProblem(name, existing, current, "category");
}
