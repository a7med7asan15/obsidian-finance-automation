import test from "node:test";
import assert from "node:assert/strict";
import { noteNameProblem, sameName } from "../src/domain/names.ts";

test("a name is judged against the ones already taken", () => {
  const taken = ["CIB", "Cash"];
  assert.equal(noteNameProblem("Wallet", taken, "", "account"), null);
  assert.match(noteNameProblem("cib", taken, "", "account") ?? "", /already an account called cib/);
  // An account keeps its own name through a rename.
  assert.equal(noteNameProblem("CIB", taken, "CIB", "account"), null);
});

test("a name that could not be a file name is refused", () => {
  assert.match(noteNameProblem("", [], "", "account") ?? "", /account needs a name/);
  assert.match(noteNameProblem("CIB/Current", [], "", "account") ?? "", /cannot contain \//);
  assert.match(noteNameProblem(".hidden", [], "", "account") ?? "", /start with a dot/);
});

test("names are compared without case or surrounding space", () => {
  assert.equal(sameName(" CIB ", "cib"), true);
  assert.equal(sameName("CIB", "Cash"), false);
});
