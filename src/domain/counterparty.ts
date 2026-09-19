import type { CounterpartyRole } from "../data/types.ts";

/**
 * Every transaction has another side to it, and what that side is called
 * depends on which way the money went: a shop is a merchant, a person you sent
 * money to is a recipient, an employer who paid you is a sender. The role names
 * double as the frontmatter keys, so a note stores the name under `merchant`,
 * `recipient` or `sender` and the key itself says which one it is.
 */
export const COUNTERPARTY_ROLES: CounterpartyRole[] = ["merchant", "recipient", "sender"];

export const ROLE_LABELS: Record<CounterpartyRole, string> = {
  merchant: "Merchant",
  recipient: "Recipient",
  sender: "Sender",
  "": "Other party",
};

/** Money out meets a merchant or a recipient; money in comes from a sender. */
export function roleForType(type: string): CounterpartyRole {
  if (type === "credit") return "sender";
  if (type === "transfer") return "recipient";
  // debit, fee, and a type the parser could not work out.
  return "merchant";
}

/**
 * The frontmatter for one name: set under the key its role owns and blank under
 * the other two, so a note never names the same party twice. An empty value is
 * a deletion in `updateTransaction`, which is what moves a name from one key to
 * another when the type of a transaction is corrected by hand.
 */
export function counterpartyFields(
  name: string,
  role: CounterpartyRole,
): { merchant: string; recipient: string; sender: string } {
  const fields = { merchant: "", recipient: "", sender: "" };
  fields[role || "merchant"] = String(name ?? "").trim();
  return fields;
}

/**
 * Banks pad names out with runs of spaces — "CANCUN RESORT   SPA" — and end
 * them with whatever punctuation led to the next clause. Folding both makes two
 * spellings of one shop group together in the merchant list.
 */
export function cleanCounterpartyName(raw: string): string {
  return String(raw ?? "")
    .replace(/\s+/gu, " ")
    .replace(/^[\s\-–—*#:.,;]+/u, "")
    .replace(/[\s\-–—*#:.,;]+$/u, "")
    .trim();
}

/**
 * Reads the party out of the three keys, the key it sits under giving the role.
 * `merchant` wins when more than one is filled in, which only happens to a note
 * edited by hand.
 */
export function readCounterparty(values: {
  merchant?: string;
  recipient?: string;
  sender?: string;
}): { counterparty: string; counterpartyRole: CounterpartyRole } {
  for (const role of COUNTERPARTY_ROLES) {
    // Cleaned on the way in, so a name reads and groups and searches the same
    // everywhere, whatever padding the bank put in the note.
    const name = cleanCounterpartyName(values[role as "merchant" | "recipient" | "sender"] ?? "");
    if (name) return { counterparty: name, counterpartyRole: role };
  }
  return { counterparty: "", counterpartyRole: "" };
}

/** The key two spellings of one name share. */
export function counterpartyKey(name: string): string {
  return cleanCounterpartyName(name).toLocaleLowerCase();
}
