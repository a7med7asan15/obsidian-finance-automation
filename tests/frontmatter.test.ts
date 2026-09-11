import test from "node:test";
import assert from "node:assert/strict";
import { readNumber, readString, readBoolean, readStringList } from "../src/data/frontmatter.ts";

test("readNumber accepts plain numbers", () => {
  assert.equal(readNumber(1234.5), 1234.5);
});

test("readNumber strips thousands separators from strings", () => {
  assert.equal(readNumber("1,234.50"), 1234.5);
});

test("readNumber rejects unusable values", () => {
  for (const value of [null, undefined, "", "abc", NaN, {}]) {
    assert.equal(readNumber(value), null, `expected null for ${JSON.stringify(value)}`);
  }
});

test("readNumber accepts a negative amount", () => {
  assert.equal(readNumber("-40"), -40);
});

test("readString trims and tolerates non-strings", () => {
  assert.equal(readString("  CIB "), "CIB");
  assert.equal(readString(42), "42");
  assert.equal(readString(null), "");
  assert.equal(readString(undefined), "");
});

test("readBoolean understands YAML's several spellings of true", () => {
  for (const value of [true, "true", "True", "yes", "y", 1, "1"]) {
    assert.equal(readBoolean(value, false), true, `expected true for ${JSON.stringify(value)}`);
  }
  for (const value of [false, "false", "no", 0, "0"]) {
    assert.equal(readBoolean(value, true), false, `expected false for ${JSON.stringify(value)}`);
  }
});

test("readBoolean returns the fallback when absent", () => {
  assert.equal(readBoolean(undefined, true), true);
  assert.equal(readBoolean(null, false), false);
  assert.equal(readBoolean("", true), true);
});

test("readStringList handles a list, a single value, and nothing", () => {
  assert.deepEqual(readStringList(["a", "b"]), ["a", "b"]);
  assert.deepEqual(readStringList("a"), ["a"]);
  assert.deepEqual(readStringList(null), []);
  assert.deepEqual(readStringList([1, null, "b", ""]), ["1", "b"]);
});
