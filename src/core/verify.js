// Re-running a receipt outside Jira. Inputs are what Judge publishes: the exact checks (freeze comment), the receipt
// data (receipt comment), and the delivered bytes. The answer is the same receipt hash, or the list of what differs.

import { createHash } from "node:crypto";
import { canonicalize, checksHash } from "./criteria.js";
import { recheck } from "./receipt.js";

const sha256 = (s) => createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export async function verifyReceipt({ checksJson, receiptJson, content, expectHash }) {
  let checks, core;
  try {
    checks = JSON.parse(checksJson);
  } catch {
    return { ok: false, receiptHash: null, problems: ["the checks are not valid JSON"] };
  }
  try {
    core = JSON.parse(receiptJson);
  } catch {
    return { ok: false, receiptHash: null, problems: ["the receipt data is not valid JSON"] };
  }
  if (!isObject(core) || !isObject(core.delivery) || typeof core.checksHash !== "string") {
    return { ok: false, receiptHash: null, problems: ["the receipt data is not a Judge receipt"] };
  }
  const frozen = { checks, checksHash: checksHash(checks) };
  const shownHash = sha256(canonicalize(core));
  let r;
  try {
    r = await recheck({ core, receiptHash: shownHash, checkedAt: "" }, { frozen, content });
  } catch (e) {
    return { ok: false, receiptHash: null, problems: [`the checks could not run: ${e.message}`] };
  }
  const problems = [...r.problems];
  if (expectHash && String(expectHash).trim().toLowerCase() !== shownHash) problems.push("the receipt data does not match the receipt hash shown in Jira");
  return { ok: problems.length === 0, receiptHash: r.receiptHash, problems };
}
