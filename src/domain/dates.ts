import type { Period } from "../data/types.ts";

const TIMEZONE = "Africa/Cairo";
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const CAIRO_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});

function formatInCairo(instant: Date): { date: string; time: string } {
  const parts = CAIRO_FORMAT.formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${hour}:${get("minute")}` };
}

/**
 * A timestamp with no offset is treated as already being Cairo wall-clock time —
 * which is what the iPhone Shortcut and the note template produce — so it is read
 * literally rather than reinterpreted. Anything with an offset or a Z is converted.
 */
export function toDateParts(
  timestamp: string,
): { date: string; month: string; year: string; time: string; epoch: number } | null {
  const text = String(timestamp ?? "").trim();
  if (!text) return null;

  const naive = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (naive) {
    const [, year, month, day, hour, minute, second] = naive;
    const epoch = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second ?? "00"}+03:00`);
    return {
      date: `${year}-${month}-${day}`,
      month: `${year}-${month}`,
      year,
      time: `${hour}:${minute}`,
      epoch: Number.isNaN(epoch) ? 0 : epoch,
    };
  }

  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const epoch = Date.parse(`${year}-${month}-${day}T00:00:00+03:00`);
    return {
      date: `${year}-${month}-${day}`, month: `${year}-${month}`, year, time: "00:00",
      epoch: Number.isNaN(epoch) ? 0 : epoch,
    };
  }

  const instant = new Date(text);
  if (Number.isNaN(instant.getTime())) return null;
  const { date, time } = formatInCairo(instant);
  return { date, month: date.slice(0, 7), year: date.slice(0, 4), time, epoch: instant.getTime() };
}

/** Cairo wall-clock time in the shape the notes write it: "YYYY-MM-DDTHH:mm:00". */
export function cairoNow(now: Date = new Date()): string {
  const { date, time } = formatInCairo(now);
  return `${date}T${time}:00`;
}

export function cairoToday(now: Date = new Date()): string {
  return formatInCairo(now).date;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function resolvePeriod(period: Period, today: string): { from: string; to: string } | null {
  if (period.unit === "all") return null;

  if (period.unit === "custom") {
    const from = period.from ?? today;
    const to = period.to ?? today;
    return from <= to ? { from, to } : { from: to, to: from };
  }

  if (period.unit === "year") {
    const year = /^\d{4}$/.test(period.anchor) ? period.anchor : today.slice(0, 4);
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }

  const anchor = /^\d{4}-\d{2}$/.test(period.anchor) ? period.anchor : today.slice(0, 7);
  const [year, month] = anchor.split("-").map(Number);
  const last = String(lastDayOfMonth(year, month)).padStart(2, "0");
  return { from: `${anchor}-01`, to: `${anchor}-${last}` };
}

export function addMonths(anchor: string, delta: number): string {
  const [year, month] = anchor.split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

export function stepPeriod(period: Period, delta: number): Period {
  if (period.unit === "month") return { ...period, anchor: addMonths(period.anchor, delta) };
  if (period.unit === "year") return { ...period, anchor: String(Number(period.anchor) + delta) };
  return period;
}

function longDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${Number(day)} ${SHORT_MONTHS[Number(month) - 1]} ${year}`;
}

export function periodLabel(period: Period): string {
  if (period.unit === "all") return "All time";
  if (period.unit === "year") return period.anchor;
  if (period.unit === "custom") {
    return `${longDate(period.from ?? "")} – ${longDate(period.to ?? "")}`;
  }
  const [year, month] = period.anchor.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  while (cursor <= end) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000;
  }
  return days;
}
