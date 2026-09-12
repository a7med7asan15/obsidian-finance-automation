import test from "node:test";
import assert from "node:assert/strict";
import { stubObsidian } from "./helpers/obsidian-stub.ts";

stubObsidian();

const { fakeApp } = await import("./helpers/fake-app.ts");
const {
  categoryNote,
  categoryNotePath,
  createCategoryNote,
  deleteCategoryNote,
  renameCategoryNote,
} = await import("../src/data/categories.ts");

const DRAFT = { name: "Coffee", currency: "EGP", color: null, icon: null, monthlyBudget: null };

test("a new category is a note the index can read back", async () => {
  const app = fakeApp();
  const path = await createCategoryNote(app, DRAFT);
  assert.equal(path, "Budget/Settings/Categories/Coffee.md");
  assert.equal(
    app.vault.files.get(path),
    '---\ntype: category\nname: "Coffee"\ncurrency: EGP\nmonthly_budget:\n---\n\n# Coffee\n',
  );
});

test("a colour, icon and budget are written only when they were chosen", () => {
  const note = categoryNote({
    name: "Coffee", currency: "EGP", color: "#3B82F6", icon: "utensils", monthlyBudget: 500,
  });
  assert.match(note, /monthly_budget: 500\n/);
  assert.match(note, /color: "#3B82F6"\n/);
  assert.match(note, /icon: utensils\n/);
  assert.doesNotMatch(categoryNote(DRAFT), /color:|icon:/);
});

test("an existing note is never overwritten by a new category", async () => {
  const app = fakeApp();
  await createCategoryNote(app, DRAFT);
  app.vault.files.set(categoryNotePath("Coffee"), "mine");
  await assert.rejects(createCategoryNote(app, DRAFT), /already exists/);
  assert.equal(app.vault.files.get(categoryNotePath("Coffee")), "mine");
});

test("renaming moves the note and the name it carries", async () => {
  const app = fakeApp();
  const path = await createCategoryNote(app, DRAFT);
  const moved = await renameCategoryNote(app, path, "Cafés");

  assert.equal(moved, "Budget/Settings/Categories/Cafés.md");
  assert.equal(app.vault.files.has(path), false);
  assert.match(app.vault.files.get(moved)!, /name: Cafés/);
  // The body is the user's, heading and all, so it is left as it was.
  assert.match(app.vault.files.get(moved)!, /# Coffee/);
});

test("renaming onto a name whose file is taken changes nothing", async () => {
  const app = fakeApp();
  const path = await createCategoryNote(app, DRAFT);
  await createCategoryNote(app, { ...DRAFT, name: "Dining" });

  await assert.rejects(renameCategoryNote(app, path, "Dining"), /already exists/);
  assert.match(app.vault.files.get(path)!, /name: "Coffee"/);
});

test("deleting takes the note out of the vault", async () => {
  const app = fakeApp();
  const path = await createCategoryNote(app, DRAFT);
  await deleteCategoryNote(app, path);
  assert.equal(app.vault.files.has(path), false);
  await assert.rejects(deleteCategoryNote(app, path), /is not a file/);
});
