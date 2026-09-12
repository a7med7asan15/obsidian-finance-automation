import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanCounterpartyName, counterpartyFields, counterpartyKey, readCounterparty, roleForType,
} from "../src/domain/counterparty.ts";

test("the role follows the direction the money went", () => {
  assert.equal(roleForType("debit"), "merchant");
  assert.equal(roleForType("fee"), "merchant");
  assert.equal(roleForType("transfer"), "recipient");
  assert.equal(roleForType("credit"), "sender");
  // A message the parser could not read still names a merchant more often than
  // anything else, so that is where an unknown type files its party.
  assert.equal(roleForType(""), "merchant");
});

test("one name is written under its role's key and blanked under the others", () => {
  assert.deepEqual(counterpartyFields("Carrefour", "merchant"), {
    merchant: "Carrefour", recipient: "", sender: "",
  });
  assert.deepEqual(counterpartyFields("Ahmed", "recipient"), {
    merchant: "", recipient: "Ahmed", sender: "",
  });
  assert.deepEqual(counterpartyFields("Employer", "sender"), {
    merchant: "", recipient: "", sender: "Employer",
  });
});

test("an empty name still blanks all three keys, which is how a party is cleared", () => {
  assert.deepEqual(counterpartyFields("  ", "sender"), {
    merchant: "", recipient: "", sender: "",
  });
});

test("the key a name sits under gives its role", () => {
  assert.deepEqual(readCounterparty({ merchant: "Carrefour" }), {
    counterparty: "Carrefour", counterpartyRole: "merchant",
  });
  assert.deepEqual(readCounterparty({ recipient: "Ahmed" }), {
    counterparty: "Ahmed", counterpartyRole: "recipient",
  });
  assert.deepEqual(readCounterparty({ sender: "Employer" }), {
    counterparty: "Employer", counterpartyRole: "sender",
  });
  assert.deepEqual(readCounterparty({}), { counterparty: "", counterpartyRole: "" });
});

test("a name is cleaned as it is read, so the padding in a note never spreads", () => {
  assert.deepEqual(readCounterparty({ merchant: "CANCUN RESORT   SPA " }), {
    counterparty: "CANCUN RESORT SPA", counterpartyRole: "merchant",
  });
});

test("a note edited by hand into naming two parties reads as the merchant", () => {
  assert.deepEqual(readCounterparty({ merchant: "Carrefour", sender: "Employer" }), {
    counterparty: "Carrefour", counterpartyRole: "merchant",
  });
});

test("a bank's padding and trailing punctuation are folded away", () => {
  assert.equal(cleanCounterpartyName("CANCUN RESORT   SPA"), "CANCUN RESORT SPA");
  assert.equal(cleanCounterpartyName("  Carrefour Maadi -"), "Carrefour Maadi");
  assert.equal(cleanCounterpartyName("* Seoudi,"), "Seoudi");
  assert.equal(cleanCounterpartyName(""), "");
});

test("two spellings of one shop share a key", () => {
  assert.equal(counterpartyKey("CANCUN RESORT   SPA"), counterpartyKey("Cancun Resort Spa"));
  assert.notEqual(counterpartyKey("Carrefour"), counterpartyKey("Seoudi"));
});
