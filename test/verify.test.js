// Re-running a receipt outside Jira: the exact checks (from the freeze comment), the receipt data (from the receipt
// comment) and the delivered bytes must give the same receipt hash, or the verifier says what differs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { freezeRecord, canonicalize } from "../src/core/criteria.js";
import { evaluate } from "../src/core/receipt.js";
import { verifyReceipt } from "../src/core/verify.js";

const CHECKS = { version: 1, checks: [{ kind: "contains", params: { all: ["## Summary", "## How it was tested"] } }, { kind: "length", params: { max: 400, unit: "words" } }] };
const FILE = Buffer.from("## Summary\nLogin failed for 23 minutes.\n## How it was tested\nRan the login suite twice.\n");
const frozen = freezeRecord(CHECKS, { accountId: "a", at: "2026-11-04T14:10:00.000Z" });
const receipt = await evaluate({ issueKey: "KAN-2", frozen, delivery: { source: "attachment", id: "10010", name: "postmortem.md", content: FILE }, at: "2026-11-04T14:20:00.000Z" });
const checksJson = canonicalize(frozen.checks);
const receiptJson = canonicalize(receipt.core);

test("the published checks, receipt data and the delivered file reproduce the receipt hash", async () => {
  assert.deepEqual(await verifyReceipt({ checksJson, receiptJson, content: FILE, expectHash: receipt.receiptHash }), { ok: true, receiptHash: receipt.receiptHash, problems: [] });
});

test("a different file is caught, and so is a checks file that is not the frozen one", async () => {
  const other = await verifyReceipt({ checksJson, receiptJson, content: Buffer.from("## Summary only") });
  assert.equal(other.ok, false);
  assert.ok(other.problems.some((p) => /delivery bytes/.test(p)), other.problems.join("; "));
  const looser = JSON.stringify({ version: 1, checks: [{ kind: "length", params: { max: 9999 } }] });
  const moved = await verifyReceipt({ checksJson: looser, receiptJson, content: FILE });
  assert.equal(moved.ok, false);
  assert.ok(moved.problems.some((p) => /checks/.test(p)), moved.problems.join("; "));
});

test("receipt data edited after the fact no longer matches the hash shown in Jira", async () => {
  const edited = JSON.parse(receiptJson);
  edited.pass = !edited.pass;
  const r = await verifyReceipt({ checksJson, receiptJson: JSON.stringify(edited), content: FILE, expectHash: receipt.receiptHash });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /hash shown/.test(p)), r.problems.join("; "));
});

test("input that is not JSON is refused with a plain reason, never a crash", async () => {
  const r = await verifyReceipt({ checksJson: "{nope", receiptJson, content: FILE });
  assert.deepEqual(r, { ok: false, receiptHash: null, problems: ["the checks are not valid JSON"] });
  const q = await verifyReceipt({ checksJson, receiptJson: "[]", content: FILE });
  assert.equal(q.ok, false);
  assert.match(q.problems[0], /receipt data/);
});

test("the command-line verifier prints CONFIRMED and exits 0 for a good receipt, and exits 1 otherwise", () => {
  const dir = mkdtempSync(join(tmpdir(), "judge-verify-"));
  writeFileSync(join(dir, "checks.json"), checksJson);
  writeFileSync(join(dir, "receipt.json"), receiptJson);
  writeFileSync(join(dir, "postmortem.md"), FILE);
  writeFileSync(join(dir, "wrong.md"), "nothing here");
  const bin = fileURLToPath(new URL("../bin/recheck.js", import.meta.url));
  const out = execFileSync(process.execPath, [bin, "--checks", join(dir, "checks.json"), "--receipt", join(dir, "receipt.json"), "--file", join(dir, "postmortem.md"), "--expect", receipt.receiptHash], { encoding: "utf8" });
  assert.match(out, /^CONFIRMED/m);
  assert.ok(out.includes(receipt.receiptHash));
  let code = 0;
  try {
    execFileSync(process.execPath, [bin, "--checks", join(dir, "checks.json"), "--receipt", join(dir, "receipt.json"), "--file", join(dir, "wrong.md")], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    code = e.status;
    assert.match(String(e.stdout), /^DIFFERENT/m);
  }
  assert.equal(code, 1);
});
