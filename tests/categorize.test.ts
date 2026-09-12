import test from "node:test";
import assert from "node:assert/strict";
import {
  categorize, categoryNameProblem, renamedCategory, withKeyword, withKeywords, withoutCategory,
} from "../src/domain/categorize.ts";

const RULES = {
  rules: [
    { category: "Groceries", keywords: ["carrefour"] },
    { category: "Dining", keywords: ["cafe", "restaurant"] },
  ],
};

test("a keyword is added to the category it was filed under", () => {
  const next = withKeyword(RULES, "Groceries", "Seoudi");
  assert.deepEqual(next.rules[0], { category: "Groceries", keywords: ["carrefour", "Seoudi"] });
  assert.equal(categorize("purchase at seoudi maadi", next), "Groceries");
});

test("filing a keyword again elsewhere moves it rather than matching twice", () => {
  const next = withKeyword(RULES, "Dining", "CARREFOUR");
  assert.deepEqual(next.rules[0], { category: "Groceries", keywords: [] });
  assert.deepEqual(next.rules[1]!.keywords, ["cafe", "restaurant", "CARREFOUR"]);
  assert.equal(categorize("purchase at Carrefour", next), "Dining");
});

test("a category with no rule yet gains one", () => {
  const next = withKeyword(RULES, "Health", "El Ezaby");
  assert.deepEqual(next.rules.at(-1), { category: "Health", keywords: ["El Ezaby"] });
});

test("the rules are left alone when either half is missing", () => {
  assert.deepEqual(withKeyword(RULES, "", "Seoudi").rules, RULES.rules);
  assert.deepEqual(withKeyword(RULES, "Groceries", "   ").rules, RULES.rules);
});

test("the original rules are never mutated", () => {
  withKeyword(RULES, "Dining", "carrefour");
  assert.deepEqual(RULES.rules[0]!.keywords, ["carrefour"]);
});

test("a replaced keyword list takes the words off the other categories", () => {
  const next = withKeywords(RULES, "Dining", ["carrefour", "cafe"]);
  assert.deepEqual(next.rules[0], { category: "Groceries", keywords: [] });
  assert.deepEqual(next.rules[1]!.keywords, ["carrefour", "cafe"]);
});

test("blank and repeated keywords are dropped, and the first spelling wins", () => {
  const next = withKeywords(RULES, "Dining", [" cafe ", "", "CAFE", "bakery"]);
  assert.deepEqual(next.rules[1]!.keywords, ["cafe", "bakery"]);
});

test("an emptied keyword list leaves the category with a rule and no words", () => {
  const next = withKeywords(RULES, "Groceries", []);
  assert.deepEqual(next.rules[0], { category: "Groceries", keywords: [] });
  assert.equal(categorize("purchase at carrefour", next), "Uncategorized");
});

test("a category with no rule yet gains one from its keywords", () => {
  const next = withKeywords(RULES, "Health", ["El Ezaby"]);
  assert.deepEqual(next.rules.at(-1), { category: "Health", keywords: ["El Ezaby"] });
});

test("a renamed category keeps its keywords under the new name", () => {
  const next = renamedCategory(RULES, "Dining", "Eating out");
  assert.deepEqual(next.rules[1], { category: "Eating out", keywords: ["cafe", "restaurant"] });
  assert.equal(categorize("cafe grande", next), "Eating out");
});

test("renaming onto an existing category merges the two rules into one", () => {
  const next = renamedCategory(RULES, "Dining", "groceries");
  assert.equal(next.rules.length, 1);
  assert.deepEqual(next.rules[0], {
    category: "groceries", keywords: ["carrefour", "cafe", "restaurant"],
  });
});

test("a deleted category takes its rule with it", () => {
  const next = withoutCategory(RULES, "groceries");
  assert.deepEqual(next.rules, [{ category: "Dining", keywords: ["cafe", "restaurant"] }]);
});

test("the rules survive a rename or a delete of a name that is not there", () => {
  assert.deepEqual(renamedCategory(RULES, "Health", "Medical").rules, RULES.rules);
  assert.deepEqual(withoutCategory(RULES, "Health").rules, RULES.rules);
  assert.deepEqual(renamedCategory(RULES, "Dining", "").rules, RULES.rules);
});

test("the original rules are never mutated by an edit", () => {
  withKeywords(RULES, "Dining", ["carrefour"]);
  renamedCategory(RULES, "Dining", "Groceries");
  assert.deepEqual(RULES.rules[0]!.keywords, ["carrefour"]);
  assert.deepEqual(RULES.rules[1]!.keywords, ["cafe", "restaurant"]);
});

test("a category name is refused when the vault could not file it", () => {
  const taken = ["Groceries", "Dining"];
  assert.equal(categoryNameProblem("Health", taken), null);
  assert.match(categoryNameProblem("  ", taken) ?? "", /needs a name/);
  assert.match(categoryNameProblem("Food/Drink", taken) ?? "", /cannot contain \//);
  assert.match(categoryNameProblem(".hidden", taken) ?? "", /start with a dot/);
  assert.match(categoryNameProblem("groceries", taken) ?? "", /already a category/);
});

test("a category keeps its own name through a rename", () => {
  assert.equal(categoryNameProblem("Groceries", ["Groceries", "Dining"], "Groceries"), null);
  assert.match(categoryNameProblem("Dining", ["Groceries", "Dining"], "Groceries") ?? "", /already/);
});
