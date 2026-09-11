import test from "node:test";
import assert from "node:assert/strict";
import { formatAmount, formatMoney, formatDayHeader, formatTime, directionOf } from "../src/ui/format.ts";
import { categoryColor, CATEGORY_PALETTE } from "../src/ui/colors.ts";
import { buildCategory } from "../src/data/records.ts";
import { makeTransaction } from "./helpers/factory.ts";

test("formatAmount groups thousands and always shows two decimals", () => {
  assert.equal(formatAmount(1420.5), "1,420.50");
  assert.equal(formatAmount(0), "0.00");
  assert.equal(formatAmount(1000000), "1,000,000.00");
});

test("formatAmount renders the magnitude, never a minus sign", () => {
  assert.equal(formatAmount(-420), "420.00");
});

test("formatMoney appends the currency", () => {
  assert.equal(formatMoney(1420.5, "EGP"), "1,420.50 EGP");
});

test("directionOf reads the transaction type", () => {
  assert.equal(directionOf(makeTransaction({ transaction_type: "credit" })), "in");
  assert.equal(directionOf(makeTransaction({ transaction_type: "debit" })), "out");
  assert.equal(directionOf(makeTransaction({ transaction_type: "fee" })), "out");
  assert.equal(directionOf(makeTransaction({ transaction_type: "transfer" })), "neutral");
  assert.equal(directionOf(makeTransaction({ transaction_type: "" })), "neutral");
});

test("formatDayHeader says Today and Yesterday", () => {
  assert.equal(formatDayHeader("2026-09-11", "2026-09-11"), "Today");
  assert.equal(formatDayHeader("2026-09-10", "2026-09-11"), "Yesterday");
});

test("formatDayHeader spells out other days", () => {
  assert.equal(formatDayHeader("2026-09-05", "2026-09-11"), "Saturday, 5 September");
});

test("formatDayHeader labels the undated bucket", () => {
  assert.equal(formatDayHeader("", "2026-09-11"), "No date");
});

test("formatTime tolerates a missing time", () => {
  assert.equal(formatTime("14:35"), "14:35");
  assert.equal(formatTime(null), "");
});

test("categoryColor prefers the note's colour", () => {
  const categories = new Map([
    ["Groceries", buildCategory({ type: "category", name: "Groceries", color: "#3B82F6" }, "x.md")],
  ]);
  assert.equal(categoryColor("Groceries", categories), "#3B82F6");
});

test("categoryColor falls back to a stable palette entry", () => {
  const empty = new Map();
  const first = categoryColor("Dining", empty);
  assert.ok(CATEGORY_PALETTE.includes(first));
  assert.equal(first, categoryColor("Dining", empty), "the same name must always get the same colour");
  assert.notEqual(first, categoryColor("Transport", empty));
});
