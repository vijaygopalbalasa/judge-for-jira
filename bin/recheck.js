#!/usr/bin/env node
// Re-run a Judge receipt on your own computer, with no Jira access:
//   node bin/recheck.js --checks checks.json --receipt receipt.json --file <delivered file> [--expect <receipt hash>]
//   node bin/recheck.js --checks checks.json --receipt receipt.json --comment comment.json [--expect <receipt hash>]
// checks.json: the JSON block in Judge's "Acceptance checks frozen" comment.
// receipt.json: the JSON block in Judge's PASS or FAIL comment.
// --file: the attachment that was delivered. --comment: for a comment delivery, the comment's JSON from Jira
//   (GET /rest/api/3/issue/<KEY>/comment/<ID>; the ID is in the receipt as delivery.id).
// --expect: the receipt hash shown in that comment.
// Prints CONFIRMED and exits 0 when everything matches; prints DIFFERENT and what differs, and exits 1, otherwise.

import { readFileSync } from "node:fs";
import { commentDelivery, verifyReceipt } from "../src/core/verify.js";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 1 ? process.argv[i + 1] : undefined;
}

const checksPath = arg("--checks");
const receiptPath = arg("--receipt");
const filePath = arg("--file");
const commentPath = arg("--comment");
if (!checksPath || !receiptPath || !filePath === !commentPath) {
  console.error("Usage: node bin/recheck.js --checks checks.json --receipt receipt.json (--file <delivered file> | --comment comment.json) [--expect <receipt hash>]");
  process.exit(2);
}

const result = await verifyReceipt({
  checksJson: readFileSync(checksPath, "utf8"),
  receiptJson: readFileSync(receiptPath, "utf8"),
  content: filePath ? readFileSync(filePath) : commentDelivery(readFileSync(commentPath, "utf8")),
  expectHash: arg("--expect"),
});

if (result.ok) {
  console.log(`CONFIRMED receipt ${result.receiptHash}`);
  process.exit(0);
}
console.log(`DIFFERENT${result.receiptHash ? ` (re-running gives receipt ${result.receiptHash})` : ""}`);
for (const p of result.problems) console.log(`- ${p}`);
process.exit(1);
