import type { TransactionRecord } from "../data/types.ts";

const AMOUNT_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatAmount(amount: number): string {
  return AMOUNT_FORMAT.format(Math.abs(amount));
}

export function formatMoney(amount: number, currency: string): string {
  return currency ? `${formatAmount(amount)} ${currency}` : formatAmount(amount);
}

export function directionOf(record: TransactionRecord): "in" | "out" | "neutral" {
  if (record.type === "credit") return "in";
  if (record.type === "debit" || record.type === "fee") return "out";
  return "neutral";
}

export function formatSignedMoney(record: TransactionRecord): string {
  const direction = directionOf(record);
  const sign = direction === "out" ? "−" : direction === "in" ? "+" : "";
  return `${sign}${formatAmount(record.amount ?? 0)}`;
}

export function formatDayHeader(date: string, today: string): string {
  if (!date) return "No date";
  if (date === today) return "Today";

  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000)
    .toISOString().slice(0, 10);
  if (date === yesterday) return "Yesterday";

  const instant = new Date(`${date}T00:00:00Z`);
  const weekday = WEEKDAYS[instant.getUTCDay()];
  const month = MONTHS[instant.getUTCMonth()];
  return `${weekday}, ${instant.getUTCDate()} ${month}`;
}

export function formatTime(time: string | null): string {
  return time ?? "";
}
