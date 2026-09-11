import test from "node:test";
import assert from "node:assert/strict";
import {
  toDateParts, cairoToday, resolvePeriod, stepPeriod, periodLabel, addMonths, daysBetween,
} from "../src/domain/dates.ts";
import type { Period } from "../src/data/types.ts";

test("toDateParts reads an ISO timestamp with an explicit offset", () => {
  const parts = toDateParts("2026-08-29T14:35:02+03:00");
  assert.deepEqual(
    { date: parts!.date, month: parts!.month, year: parts!.year, time: parts!.time },
    { date: "2026-08-29", month: "2026-08", year: "2026", time: "14:35" },
  );
});

test("toDateParts reads a naive timestamp as Cairo local time", () => {
  const parts = toDateParts("2026-08-29T14:35:02");
  assert.equal(parts!.date, "2026-08-29");
  assert.equal(parts!.time, "14:35");
});

test("toDateParts converts a UTC timestamp into the Cairo day", () => {
  // 22:30 UTC is 01:30 the next day in Cairo (UTC+3).
  const parts = toDateParts("2026-08-29T22:30:00Z");
  assert.equal(parts!.date, "2026-08-30");
  assert.equal(parts!.month, "2026-08");
});

test("toDateParts returns null for junk", () => {
  assert.equal(toDateParts(""), null);
  assert.equal(toDateParts("not a date"), null);
});

test("cairoToday formats as YYYY-MM-DD", () => {
  assert.match(cairoToday(new Date("2026-09-11T10:00:00Z")), /^2026-09-11$/);
});

test("resolvePeriod bounds a month, including the last day", () => {
  const period: Period = { unit: "month", anchor: "2026-02", from: null, to: null };
  assert.deepEqual(resolvePeriod(period, "2026-09-11"), { from: "2026-02-01", to: "2026-02-28" });
});

test("resolvePeriod handles a leap February", () => {
  const period: Period = { unit: "month", anchor: "2028-02", from: null, to: null };
  assert.deepEqual(resolvePeriod(period, "2028-09-11"), { from: "2028-02-01", to: "2028-02-29" });
});

test("resolvePeriod bounds a year", () => {
  const period: Period = { unit: "year", anchor: "2026", from: null, to: null };
  assert.deepEqual(resolvePeriod(period, "2026-09-11"), { from: "2026-01-01", to: "2026-12-31" });
});

test("resolvePeriod returns null for all time", () => {
  const period: Period = { unit: "all", anchor: "", from: null, to: null };
  assert.equal(resolvePeriod(period, "2026-09-11"), null);
});

test("resolvePeriod passes a custom range through", () => {
  const period: Period = { unit: "custom", anchor: "", from: "2026-03-05", to: "2026-04-02" };
  assert.deepEqual(resolvePeriod(period, "2026-09-11"), { from: "2026-03-05", to: "2026-04-02" });
});

test("resolvePeriod falls back to today's month when the anchor is empty", () => {
  const period: Period = { unit: "month", anchor: "", from: null, to: null };
  assert.deepEqual(resolvePeriod(period, "2026-09-11"), { from: "2026-09-01", to: "2026-09-30" });
});

test("stepPeriod moves a month backwards across a year boundary", () => {
  const period: Period = { unit: "month", anchor: "2026-01", from: null, to: null };
  assert.equal(stepPeriod(period, -1).anchor, "2025-12");
});

test("stepPeriod moves a year", () => {
  const period: Period = { unit: "year", anchor: "2026", from: null, to: null };
  assert.equal(stepPeriod(period, 1).anchor, "2027");
});

test("stepPeriod leaves all-time and custom ranges alone", () => {
  const all: Period = { unit: "all", anchor: "", from: null, to: null };
  assert.deepEqual(stepPeriod(all, -1), all);
  const custom: Period = { unit: "custom", anchor: "", from: "2026-03-05", to: "2026-04-02" };
  assert.deepEqual(stepPeriod(custom, 1), custom);
});

test("periodLabel is human readable", () => {
  assert.equal(periodLabel({ unit: "month", anchor: "2026-09", from: null, to: null }), "September 2026");
  assert.equal(periodLabel({ unit: "year", anchor: "2026", from: null, to: null }), "2026");
  assert.equal(periodLabel({ unit: "all", anchor: "", from: null, to: null }), "All time");
  assert.equal(
    periodLabel({ unit: "custom", anchor: "", from: "2026-03-05", to: "2026-04-02" }),
    "5 Mar 2026 – 2 Apr 2026",
  );
});

test("addMonths wraps both directions", () => {
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(addMonths("2026-06", 7), "2027-01");
});

test("daysBetween is inclusive at both ends", () => {
  assert.deepEqual(daysBetween("2026-01-30", "2026-02-02"), [
    "2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02",
  ]);
});
