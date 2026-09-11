import test from "node:test";
import assert from "node:assert/strict";
import { niceMax, linearScale, arcPath } from "../src/ui/charts/svg.ts";

test("niceMax rounds up to a readable axis maximum", () => {
  assert.equal(niceMax(0), 1);
  assert.equal(niceMax(7), 10);
  assert.equal(niceMax(12), 20);
  assert.equal(niceMax(23), 25);
  assert.equal(niceMax(180), 200);
  assert.equal(niceMax(1420.5), 2000);
  assert.equal(niceMax(9999), 10000);
});

test("niceMax never returns less than the value", () => {
  for (const value of [1, 3, 17, 99, 101, 4999, 123456]) {
    assert.ok(niceMax(value) >= value, `niceMax(${value}) = ${niceMax(value)}`);
  }
});

test("linearScale maps the domain onto the range", () => {
  const scale = linearScale(100, 200);
  assert.equal(scale(0), 0);
  assert.equal(scale(50), 100);
  assert.equal(scale(100), 200);
});

test("linearScale survives a zero domain", () => {
  assert.equal(linearScale(0, 200)(0), 0);
});

test("arcPath produces a closed donut segment", () => {
  const path = arcPath(50, 50, 40, 25, 0, Math.PI / 2);
  assert.match(path, /^M /);
  assert.match(path, /A 40 40/);
  assert.match(path, /A 25 25/);
  assert.match(path, /Z$/);
});

test("a full-circle arc does not collapse to a point", () => {
  const path = arcPath(50, 50, 40, 25, 0, Math.PI * 2);
  assert.ok(path.length > 20);
  assert.match(path, /Z$/);
});
