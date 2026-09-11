export function readString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function readNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

const TRUE_VALUES = new Set(["true", "yes", "y", "1", "on"]);
const FALSE_VALUES = new Set(["false", "no", "n", "0", "off"]);

export function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined || value === "") return fallback;
  const text = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(text)) return true;
  if (FALSE_VALUES.has(text)) return false;
  return fallback;
}

export function readStringList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.map(readString).filter((item) => item.length > 0);
}
