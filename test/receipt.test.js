// A receipt: the frozen checks run on one delivery. Its core (everything but the time) is hashed, so anyone holding
// the frozen checks and the delivery bytes can re-run it and get the same receipt hash. The Done gate reads it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { freezeRecord, canonicalize } from "../src/core/criteria.js";
import { evaluate, recheck, gateDecision, receiptComment, TamperError, CHECKER_ID } from "../src/core/receipt.js";
import { adfToText } from "../src/core/adf.js";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const CHECKS = { version: 1, checks: [
  { kind: "contains", params: { all: ["## Added", "## Fixed", "KAN-7"] } },
  { kind: "length", params: { max: 60, unit: "words" } },
] };
const frozen = freezeRecord(CHECKS, { accountId: "557058:lead", at: "2026-11-04T10:00:00.000Z" });
const GOOD = Buffer.from("## Added\nExport to CSV (KAN-7)\n## Fixed\nDate filter off by one");
const BAD = Buffer.from("## Added\nExport to CSV\n");
const delivery = (content, extra = {}) => ({ source: "comment", id: "10042", content, ...extra });
const AT = "2026-11-04T11:00:00.000Z";

test("a delivery that meets every check passes with score 100, and the receipt names what was checked", async () => {
  const r = await evaluate({ issueKey: "KAN-7", frozen, delivery: delivery(GOOD), at: AT });
  assert.equal(r.core.pass, true);
  assert.equal(r.core.score, 100);
  assert.equal(r.core.issue, "KAN-7");
  assert.equal(r.core.checksHash, frozen.checksHash);
  assert.deepEqual(r.core.delivery, { source: "comment", id: "10042", sha256: sha(GOOD), bytes: GOOD.length });
  assert.equal(r.core.checker, CHECKER_ID);
  assert.equal(r.core.results.length, 2);
  assert.ok(r.core.results.every((x) => x.pass === true && typeof x.detail === "string" && typeof x.label === "string"));
  assert.equal(r.checkedAt, AT);
});

test("a delivery that misses a check fails and the result says what is missing", async () => {
  const r = await evaluate({ issueKey: "KAN-7", frozen, delivery: delivery(BAD), at: AT });
  assert.equal(r.core.pass, false);
  assert.equal(r.core.results[0].pass, false);
  assert.match(r.core.results[0].detail, /## Fixed/);
  assert.match(r.core.results[0].detail, /KAN-7/);
  assert.equal(r.core.results[1].pass, true);
});

test("the receipt hash covers the core only: the same inputs at another time give the same hash", async () => {
  const a = await evaluate({ issueKey: "KAN-7", frozen, delivery: delivery(GOOD), at: AT });
  const b = await evaluate({ issueKey: "KAN-7", frozen, delivery: delivery(GOOD), at: "2027-01-01T00:00:00.000Z" });
  assert.equal(a.receiptHash, b.receiptHash);
  assert.equal(a.receiptHash, sha(Buffer.from(canonicalize(a.core), "utf8")));
  const c = await evaluate({ issueKey: "KAN-7", frozen, delivery: delivery(BAD), at: AT });
  assert.notEqual(c.receiptHash, a.receiptHash);
});

test("an attachment delivery records its file name", async () => {
  const r = await evaluate({ issueKey: "KAN-7", frozen, delivery: delivery(GOOD, { source: "attachment", id: "20001", name: "notes.md" }), at: AT });
  assert.deepEqual(r.core.delivery, { source: "attachment", id: "20001", name: "notes.md", sha256: sha(GOOD), bytes: GOOD.length });
});

test("a frozen record whose checks no longer match its hash is refused, never run", async () => {
  const tampered = structuredClone(frozen);
  tampered.checks.checks[1].params.max = 100000;
  await assert.rejects(evaluate({ issueKey: "KAN-7", frozen: tampered, delivery: delivery(GOOD), at: AT }), TamperError);
});

test("a re-check runs the same checks on the same bytes and confirms the receipt, or says what differs", async () => {
  const r = await evaluate({ issueKey: "KAN-7", frozen, delivery: delivery(GOOD), at: AT });
  assert.deepEqual(await recheck(r, { frozen, content: GOOD }), { same: true, receiptHash: r.receiptHash, problems: [] });
  const other = await recheck(r, { frozen, content: BAD });
  assert.equal(other.same, false);
  assert.ok(other.problems.some((p) => /delivery bytes/.test(p)), other.problems.join("; "));
  const moved = freezeRecord({ version: 1, checks: [{ kind: "length", params: { max: 1 } }] }, { accountId: "x", at: AT });
  const m = await recheck(r, { frozen: moved, content: GOOD });
  assert.equal(m.same, false);
  assert.ok(m.problems.some((p) => /checks/.test(p)), m.problems.join("; "));
});

test("Done is allowed only by a passing receipt for the checks that are frozen now", async () => {
  const pass = await evaluate({ issueKey: "KAN-7", frozen, delivery: delivery(GOOD), at: AT });
  const fail = await evaluate({ issueKey: "KAN-7", frozen, delivery: delivery(BAD), at: AT });
  assert.deepEqual(gateDecision({ frozen: null, receipt: null }), { allow: true, message: "No acceptance checks are frozen on this work item." });
  assert.equal(gateDecision({ frozen, receipt: null }).allow, false);
  assert.match(gateDecision({ frozen, receipt: null }).message, /No delivery has been checked/);
  assert.equal(gateDecision({ frozen, receipt: fail }).allow, false);
  assert.match(gateDecision({ frozen, receipt: fail }).message, /failed 1 of 2 checks/);
  assert.equal(gateDecision({ frozen, receipt: pass }).allow, true);
  const refrozen = freezeRecord({ version: 1, checks: [{ kind: "length", params: { max: 500 } }] }, { accountId: "x", at: AT });
  assert.equal(gateDecision({ frozen: refrozen, receipt: pass }).allow, false, "a receipt for older checks does not count");
  assert.match(gateDecision({ frozen: refrozen, receipt: pass }).message, /checks changed/);
});

test("the receipt comment reads plainly and carries the full hashes", async () => {
  const fail = await evaluate({ issueKey: "KAN-7", frozen, delivery: delivery(BAD), at: AT });
  const adf = receiptComment(fail);
  assert.equal(adf.type, "doc");
  const text = adfToText(adf);
  assert.match(text, /FAIL/);
  assert.match(text, /1 of 2 checks passed/);
  assert.match(text, /Done stays blocked/);
  assert.ok(text.includes(frozen.checksHash), "checks hash");
  assert.ok(text.includes(fail.core.delivery.sha256), "delivery hash");
  assert.ok(text.includes(fail.receiptHash), "receipt hash");
  assert.ok(text.includes(canonicalize(fail.core)), "the receipt data is published so anyone can re-run it");
  const pass = await evaluate({ issueKey: "KAN-7", frozen, delivery: delivery(GOOD), at: AT });
  const passText = adfToText(receiptComment(pass));
  assert.match(passText, /PASS/);
  assert.match(passText, /2 of 2 checks passed/);
  assert.match(passText, /can move to Done/);
});
