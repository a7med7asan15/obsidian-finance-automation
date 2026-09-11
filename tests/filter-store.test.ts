import test from "node:test";
import assert from "node:assert/strict";
import { FilterStore } from "../src/store/filter-store.ts";

test("a new store opens on the current month", () => {
  const store = new FilterStore(null, "2026-09-11");
  assert.equal(store.get().period.unit, "month");
  assert.equal(store.get().period.anchor, "2026-09");
});

test("saved filters are restored but the period is not", () => {
  const store = new FilterStore(
    { categories: ["Groceries"], excluded: "show", period: { unit: "year", anchor: "2019", from: null, to: null } },
    "2026-09-11",
  );
  assert.deepEqual(store.get().categories, ["Groceries"]);
  assert.equal(store.get().excluded, "show");
  assert.equal(store.get().period.anchor, "2026-09", "the period must always reopen on the current month");
});

test("set notifies subscribers", () => {
  const store = new FilterStore(null, "2026-09-11");
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  store.set({ search: "carrefour" });
  assert.equal(calls, 1);
  assert.equal(store.get().search, "carrefour");
});

test("unsubscribing stops notifications", () => {
  const store = new FilterStore(null, "2026-09-11");
  let calls = 0;
  const stop = store.subscribe(() => { calls += 1; });
  stop();
  store.set({ search: "x" });
  assert.equal(calls, 0);
});

test("step moves the period", () => {
  const store = new FilterStore(null, "2026-01-15");
  store.step(-1);
  assert.equal(store.get().period.anchor, "2025-12");
});

test("toggleCategory adds then removes", () => {
  const store = new FilterStore(null, "2026-09-11");
  store.toggleCategory("Dining");
  assert.deepEqual(store.get().categories, ["Dining"]);
  store.toggleCategory("Dining");
  assert.deepEqual(store.get().categories, []);
});

test("activeCount ignores the period and the default excluded mode", () => {
  const store = new FilterStore(null, "2026-09-11");
  assert.equal(store.activeCount(), 0);
  store.step(-1);
  assert.equal(store.activeCount(), 0, "changing month is not an active filter");
  store.toggleCategory("Dining");
  store.set({ search: "uber" });
  assert.equal(store.activeCount(), 2);
  store.set({ excluded: "only" });
  assert.equal(store.activeCount(), 3);
});

test("clearAll resets everything except the period", () => {
  const store = new FilterStore(null, "2026-09-11");
  store.step(-2);
  store.toggleCategory("Dining");
  store.set({ search: "uber", amountMin: 50 });
  store.clearAll();
  assert.equal(store.activeCount(), 0);
  assert.equal(store.get().period.anchor, "2026-07", "clearing filters must not jump the period");
});

test("serialize omits the period", () => {
  const store = new FilterStore(null, "2026-09-11");
  store.toggleCategory("Dining");
  assert.equal("period" in store.serialize(), false);
  assert.deepEqual(store.serialize().categories, ["Dining"]);
});
