import test from "node:test";
import assert from "node:assert/strict";
import { stubObsidian } from "./helpers/obsidian-stub.ts";
import { makeTransaction } from "./helpers/factory.ts";

// exportCsv reaches the vault API, so the module needs `obsidian` resolvable
// even though only the pure toCsv is under test here.
stubObsidian();
const { toCsv } = await import("../src/ui/export-csv.ts");

test("the header lists every exported column", () => {
  const [header] = toCsv([]).split("\n");
  assert.equal(
    header,
    "date,time,amount,currency,type,from_account,to_account,merchant,category,status,excluded,exclude_reason,transaction_id,file",
  );
});

test("a row carries the record's values", () => {
  const csv = toCsv([makeTransaction({
    timestamp: "2026-09-05T14:35:00+03:00", amount: 1420.5, merchant: "Carrefour",
  })]);
  const [, row] = csv.split("\n");
  assert.ok(row.startsWith("2026-09-05,14:35,1420.5,EGP,debit,CIB,,Carrefour,Groceries,parsed,false,,"));
});

test("values containing a comma, a quote or a newline are quoted", () => {
  const csv = toCsv([makeTransaction({ merchant: 'Al "Mahdi", Maadi' })]);
  assert.ok(csv.includes('"Al ""Mahdi"", Maadi"'));

  const multiline = toCsv([makeTransaction({ merchant: "line one\nline two" })]);
  assert.ok(multiline.includes('"line one\nline two"'));
});

test("an excluded record exports its reason", () => {
  const csv = toCsv([makeTransaction({ excluded: true, exclude_reason: "Duplicate SMS" })]);
  assert.ok(csv.includes("true,Duplicate SMS"));
});

test("a missing amount exports as empty, not as zero", () => {
  const csv = toCsv([makeTransaction({ amount: "" })]);
  const [, row] = csv.split("\n");
  assert.equal(row.split(",")[2], "");
});

test("the file ends with a newline", () => {
  assert.ok(toCsv([makeTransaction()]).endsWith("\n"));
});
