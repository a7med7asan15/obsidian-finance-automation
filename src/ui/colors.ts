import type { CategoryRecord } from "../data/types.ts";

/**
 * Twelve hues chosen to stay distinguishable on both a light and a dark
 * background, and to remain separable for the common forms of colour blindness.
 * Used only where colour carries meaning: category identity.
 */
export const CATEGORY_PALETTE = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899",
  "#14B8A6", "#F97316", "#6366F1", "#84CC16", "#06B6D4", "#A855F7",
];

const DEFAULT_ICONS: Record<string, string> = {
  Groceries: "shopping-cart",
  Dining: "utensils",
  Transport: "car",
  Bills: "receipt",
  Shopping: "shopping-bag",
  Health: "heart-pulse",
  Income: "trending-up",
  Fees: "percent",
  Transfer: "arrow-left-right",
  Uncategorized: "circle-help",
};

function hashOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash;
}

export function categoryColor(name: string, categories: Map<string, CategoryRecord>): string {
  const configured = categories.get(name)?.color;
  if (configured) return configured;
  return CATEGORY_PALETTE[hashOf(name) % CATEGORY_PALETTE.length];
}

export function categoryIcon(name: string, categories: Map<string, CategoryRecord>): string {
  return categories.get(name)?.icon ?? DEFAULT_ICONS[name] ?? "circle-dashed";
}
