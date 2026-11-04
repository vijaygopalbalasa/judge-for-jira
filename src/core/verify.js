// Re-running a receipt outside Jira. Inputs are what Judge publishes: the exact checks (freeze comment), the receipt
// data (receipt comment), and the delivered bytes. The answer is the same receipt hash, or the list of what differs.

import { createHash } from "node:crypto";
import { canonicalize, checksHash } from "./criteria.js";
import { recheck } from "./receipt.js";
import { adfToText } from "./adf.js";
import { deliveryFromComment } from "./delivery.js";

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

/** The delivered text of a comment, exactly as Judge checked it: Jira's comment JSON (from
 * GET /rest/api/3/issue/{key}/comment/{id}) or its "body" document, through the same ADF-to-text conversion and with
 * the "Delivery" marker line removed. */
export function commentDelivery(json) {
  const parsed = typeof json === "string" ? JSON.parse(json) : json;
  const body = isObject(parsed) && "body" in parsed ? parsed.body : parsed;
  const text = typeof body === "string" ? body : adfToText(body);
  return deliveryFromComment(text) ?? text;
}
