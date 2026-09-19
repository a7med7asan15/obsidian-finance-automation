/**
 * Frontmatter, capture-link parameters and parsed YAML all arrive as `unknown`.
 * `String()` would turn an object into the literal "[object Object]" and write
 * that into a note, so anything without a sensible text form becomes "".
 */
export function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  // A YAML list reads the way it used to: "a,b".
  if (Array.isArray(value)) return value.map((item) => asText(item)).join(",");
  return "";
}

export function readString(value: unknown): string {
  return asText(value).trim();
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
  const text = asText(value).trim().toLowerCase();
  if (TRUE_VALUES.has(text)) return true;
  if (FALSE_VALUES.has(text)) return false;
  return fallback;
}

export function readStringList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.map(readString).filter((item) => item.length > 0);
}
