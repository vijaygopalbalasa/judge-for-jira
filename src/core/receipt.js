// A receipt: the frozen checks run on one delivery. The core (issue, checks hash, delivery hash, results, score)
// is hashed as canonical JSON; the time is kept outside the core, so anyone who holds the frozen checks and the
// delivery bytes can re-run the checks and get the same receipt hash. The Done gate decides from the receipt.

import { createHash } from "node:crypto";
import { runAllChecks } from "./checkers.js";
import { canonicalize, checksHash } from "./criteria.js";

export const CHECKER_ID = "judge-for-jira/1";
export class TamperError extends Error {}

const LABELS = { contains: "Required text", length: "Length", schema: "Required fields", json: "Data shape", checksum: "Exact file" };
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const asBytes = (c) => (Buffer.isBuffer(c) ? c : Buffer.from(String(c ?? ""), "utf8"));

function assertIntact(frozen) {
  if (!frozen || checksHash(frozen.checks) !== frozen.checksHash) {
    throw new TamperError("the frozen checks do not match their recorded hash");
  }
}

/** Run the frozen checks on one delivery. delivery: { source, id, name?, content }. */
export async function evaluate({ issueKey, frozen, delivery, at }) {
  assertIntact(frozen);
  const content = asBytes(delivery.content);
  const run = await runAllChecks(frozen.checks, { content, source: delivery.source });
  const results = run.results.map((r) => ({ kind: r.kind, label: LABELS[r.kind] ?? r.kind, pass: r.pass, detail: r.detail, weight: r.weight }));
  const core = {
    v: 1,
    issue: issueKey,
    checksHash: frozen.checksHash,
    delivery: {
      source: delivery.source,
      id: String(delivery.id),
      ...(delivery.name ? { name: String(delivery.name) } : {}),
      sha256: sha256(content),
      bytes: content.length,
    },
    results,
    score: run.score,
    threshold: run.threshold,
    pass: run.pass,
    checker: CHECKER_ID,
  };
  return { core, receiptHash: sha256(Buffer.from(canonicalize(core), "utf8")), checkedAt: at };
}

/** Re-run a receipt from the frozen checks and the delivery bytes; say whether it holds and, if not, why. */
export async function recheck(receipt, { frozen, content }) {
  const problems = [];
  const bytes = asBytes(content);
  if (sha256(Buffer.from(canonicalize(receipt.core), "utf8")) !== receipt.receiptHash) problems.push("the receipt's hash does not match its contents");
  if (frozen.checksHash !== receipt.core.checksHash) problems.push("the checks frozen now are not the checks this receipt used");
  if (sha256(bytes) !== receipt.core.delivery.sha256) problems.push("the delivery bytes differ from the ones this receipt checked");
  const { source, id, name } = receipt.core.delivery;
  const again = await evaluate({ issueKey: receipt.core.issue, frozen, delivery: { source, id, name, content: bytes }, at: receipt.checkedAt });
  if (again.receiptHash !== receipt.receiptHash && problems.length === 0) problems.push("re-running the checks gave a different result");
  return { same: problems.length === 0, receiptHash: again.receiptHash, problems };
}

/** Whether a work item may move to Done, and the message to show if not. */
export function gateDecision({ frozen, receipt }) {
  if (!frozen) return { allow: true, message: "No acceptance checks are frozen on this work item." };
  if (!receipt) {
    return { allow: false, message: "No delivery has been checked against the frozen acceptance checks yet. Share the work as an attachment, or as a comment that starts with \"Delivery\", and Judge will check it." };
  }
  if (receipt.core.checksHash !== frozen.checksHash) {
    return { allow: false, message: "The acceptance checks changed after the last delivery was checked. Check the delivery again." };
  }
  if (!receipt.core.pass) {
    const failed = receipt.core.results.filter((r) => !r.pass);
    const list = failed.map((r) => `${r.label} (${r.detail})`).join("; ");
    return { allow: false, message: `The last delivery failed ${failed.length} of ${receipt.core.results.length} checks: ${list}. Done stays blocked until a delivery passes.` };
  }
  return { allow: true, message: "The last delivery passed every frozen check." };
}

const text = (t, marks) => (marks ? { type: "text", text: t, marks } : { type: "text", text: t });
const code = (t) => text(t, [{ type: "code" }]);

/** The receipt as an ADF comment: verdict, one line per check, what it means for Done, then the hashes. */
export function receiptComment(receipt) {
  const { core, receiptHash } = receipt;
  const passed = core.results.filter((r) => r.pass).length;
  const d = core.delivery;
  const what = d.source === "attachment" ? `attachment ${d.name ?? d.id}` : `${d.source} ${d.id}`;
  return {
    type: "doc",
    version: 1,
    content: [
      { type: "paragraph", content: [text(core.pass ? "✅ Judge: PASS" : "❌ Judge: FAIL", [{ type: "strong" }]), text(` · ${passed} of ${core.results.length} checks passed`)] },
      { type: "bulletList", content: core.results.map((r) => ({ type: "listItem", content: [{ type: "paragraph", content: [text(`${r.pass ? "✓" : "✗"} ${r.label}: ${r.detail}`)] }] })) },
      { type: "paragraph", content: [text(core.pass ? "This work item can move to Done." : "Done stays blocked until a delivery passes every check.")] },
      { type: "paragraph", content: [text("Checks "), code(core.checksHash), text(` · Delivery (${what}) `), code(d.sha256), text(" · Receipt "), code(receiptHash)] },
      { type: "paragraph", content: [text("Receipt data, to re-run this check anywhere:")] },
      { type: "codeBlock", attrs: { language: "json" }, content: [text(canonicalize(core))] },
    ],
  };
}
