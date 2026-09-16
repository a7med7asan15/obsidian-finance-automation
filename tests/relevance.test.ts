import test from "node:test";
import assert from "node:assert/strict";
import { isTransactionMessage } from "../src/domain/parser/relevance.ts";
import { withDefaultPatterns } from "../src/domain/parser/defaults.ts";
import { foldForMatch, hasKeyword } from "../src/domain/parser/patterns.ts";

// The wordings this vault's banks actually send, kept verbatim so a change to
// the keyword list has to answer for the real thread rather than a paraphrase.
const REAL_TRANSACTIONS = [
  "تم خصم EGP 350.00  من بطاقة الخصم المباشر # **0779 باستخدام Apple Pay عند  CANCUN RESORT   SPA في  10/09/26 12:16الرصيد المتاح  EGP725.07.",
  "Your Covered Card *7147 was charged for EGP2043.17 at SPINNEYS - ARABIA MALL, EGYPT on 12/09/26 at 23:35. Your available card limit is EGP97061.13",
  "Your HSBC Account ********9001 was debited with IPN outward transfer for EGP 14,014.00 on 14-09-2026 18:11 to AHMED HASSAN ABDALLAH AHMED with reference 4182988c.",
  "يرجى العلم انه تم تنفيذ تحويل لحظي بمبلغ 11000.00 جم من حسابك المنتهي بـ ********1934 برقم مرجعي 42b4213f بتاريخ 14-09-2026 15:36",
  "يرجى العلم انه تم تنفيذ تحويل لحظي بمبلغ 14000.00 جم إلى حسابك المنتهي بـ ********1934 من AHMED HASSAN ABDALLAH A برقم مرجعي 4182988c",
];

const NOT_TRANSACTIONS = [
  // The one this gate was written for: a minimum-payment reminder whose "1 جم"
  // was being filed as a 1 EGP transaction that never happened.
  "عميلنا العزيز،\nنذكركم بضرورة سداد الحد الأدنى وقدره 1 جم على بطاقتكم المغطاة التي تنتهي بـ 7147 الخاص بكشف حساب شهر اغسطس - 2026 في موعد أقصاه يوم 25/9/2026 .",
  "Your one-time password is 482910. Do not share it with anyone.",
  "كشف حسابك لشهر اغسطس 2026 جاهز الآن على تطبيق الإنترنت البنكي.",
  "عرض خاص! احصل على خصم يصل إلى 50% على مشترياتك من متاجر مختارة. اتصل بـ 19666",
  "Dear customer, your card limit has been reviewed. Available limit EGP 100,000.",
  "Your statement is ready",
];

test("every real bank transaction is read as one", () => {
  for (const sms of REAL_TRANSACTIONS) {
    assert.equal(isTransactionMessage(sms), true, sms.slice(0, 50));
  }
});

test("reminders, codes, statements and offers are not", () => {
  for (const sms of NOT_TRANSACTIONS) {
    assert.equal(isTransactionMessage(sms), false, sms.slice(0, 50));
  }
});

test("the built-in list is still in force once the vault's patterns are merged", () => {
  const merged = withDefaultPatterns({ transaction_keywords: ["prélevé"] });
  assert.equal(isTransactionMessage("Votre compte a été prélevé de EGP 40", merged), true);
  assert.equal(isTransactionMessage(REAL_TRANSACTIONS[0]!, merged), true);
  assert.equal(isTransactionMessage(NOT_TRANSACTIONS[0]!, merged), false);
});

test("a vault list on its own replaces the built-in one", () => {
  const only = { transaction_keywords: ["prélevé"] };
  assert.equal(isTransactionMessage("Votre compte a été prélevé de EGP 40", only), true);
  assert.equal(isTransactionMessage(REAL_TRANSACTIONS[0]!, only), false);
});

test("'بطاقتك' would have matched the reminder's 'بطاقتكم', which is why it is not a keyword", () => {
  // Guards the comment on DEFAULT_TRANSACTION_KEYWORDS: the short spelling is
  // a substring of the word the reminder uses, so the list keeps "من بطاقتك".
  assert.equal(hasKeyword(NOT_TRANSACTIONS[0]!, ["بطاقتك"]), true);
  assert.equal(hasKeyword(NOT_TRANSACTIONS[0]!, ["من بطاقتك"]), false);
});

test("foldForMatch makes one phrase of the alef and yaa spellings", () => {
  const folded = foldForMatch("إلى حسابك");
  assert.equal(foldForMatch("الى حسابك"), folded);
  assert.equal(foldForMatch("الي حسابك"), folded);
  assert.equal(foldForMatch("إلَى  حسابك "), folded);
});

test("foldForMatch leaves an English message recognisable, only lowered", () => {
  assert.equal(foldForMatch("Was CHARGED  for EGP 20"), "was charged for egp 20");
});

test("an empty keyword never matches everything", () => {
  assert.equal(hasKeyword("anything at all", [""]), false);
  assert.equal(hasKeyword("anything at all", []), false);
  assert.equal(hasKeyword("anything at all", undefined), false);
});
