// The app's behaviour with Jira and storage replaced by in-memory fakes: which events are judged, what is stored,
// what is posted, and what the Done gate answers. The real wiring (src/index.js) only passes Forge APIs in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createService, MAX_ATTACHMENT_BYTES } from "../src/service.js";
import { adfToText } from "../src/core/adf.js";
import { describeCheck } from "../src/core/describe.js";

const CHECKS = { version: 1, checks: [
  { kind: "contains", params: { all: ["## Added", "## Fixed"] } },
  { kind: "length", params: { max: 50, unit: "words" } },
] };
const ISSUE = { id: "10007", key: "KAN-7" };
const GOOD = "Delivery:\n## Added\nCSV export\n## Fixed\nDate filter";
const BAD = "Delivery:\n## Added\nCSV export";

function fakes({ attachments = {}, names = {} } = {}) {
  const kv = new Map();
  const posted = [];
  const deps = {
    store: { get: async (k) => kv.get(k), set: async (k, v) => void kv.set(k, structuredClone(v)), delete: async (k) => void kv.delete(k) },
    jira: {
      postComment: async (key, adf) => void posted.push({ key, text: adfToText(adf) }),
      attachmentInfo: async (id) => ({ size: attachments[id]?.length ?? 0, filename: names[id] ?? "" }),
      attachmentBytes: async (id) => attachments[id],
      issueIdForKey: async (key) => (key === ISSUE.key ? ISSUE.id : null),
    },
    now: () => "2026-11-04T12:00:00.000Z",
  };
  return { kv, posted, svc: createService(deps) };
}
const commentEvent = (body, extra = {}) => ({ eventType: "avi:jira:commented:issue", selfGenerated: false, issue: ISSUE, comment: { id: "500", body }, ...extra });

async function frozenService(opts) {
  const f = fakes(opts);
  const r = await f.svc.freeze({ issueId: ISSUE.id, issueKey: ISSUE.key, checksText: JSON.stringify(CHECKS), accountId: "557058:lead" });
  assert.equal(r.ok, true, r.error);
  f.posted.length = 0;
  return f;
}

test("freezing stores the record, announces the hash in a comment, and refuses bad input with a reason", async () => {
  const f = fakes();
  assert.deepEqual(await f.svc.freeze({ issueId: ISSUE.id, issueKey: ISSUE.key, checksText: "{not json", accountId: "a" }), { ok: false, error: "The checks are not valid JSON." });
  const bad = await f.svc.freeze({ issueId: ISSUE.id, issueKey: ISSUE.key, checksText: '{"checks":[]}', accountId: "a" });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /non-empty/);
  assert.equal(f.posted.length, 0);
  const ok = await f.svc.freeze({ issueId: ISSUE.id, issueKey: ISSUE.key, checksText: JSON.stringify(CHECKS), accountId: "557058:lead" });
  assert.equal(ok.ok, true);
  assert.equal(f.kv.get("checks:10007").checksHash, ok.record.checksHash);
  assert.equal(f.posted.length, 1);
  assert.match(f.posted[0].text, /Acceptance checks frozen/);
  assert.ok(f.posted[0].text.includes(ok.record.checksHash));
  assert.ok(f.posted[0].text.includes(describeCheck(CHECKS.checks[0])));
});

test("the simple form freezes the same checks the JSON would, and refuses a bad form with its reason", async () => {
  const f = fakes();
  const r = await f.svc.freezeForm({ issueId: ISSUE.id, issueKey: ISSUE.key, form: { requiredText: "## Added\n## Fixed", maxWords: "50" }, accountId: "a" });
  assert.equal(r.ok, true, r.error);
  const viaJson = fakes();
  const j = await viaJson.svc.freeze({ issueId: ISSUE.id, issueKey: ISSUE.key, checksText: JSON.stringify(CHECKS), accountId: "a" });
  assert.equal(r.record.checksHash, j.record.checksHash, "same checks, same hash");
  const bad = await fakes().svc.freezeForm({ issueId: ISSUE.id, issueKey: ISSUE.key, form: { maxWords: "lots" }, accountId: "a" });
  assert.deepEqual(bad, { ok: false, error: "Maximum words must be a whole number of words." });
});

test("re-freezing different checks says what they replaced", async () => {
  const f = await frozenService();
  const old = f.kv.get("checks:10007").checksHash;
  const next = { version: 1, checks: [{ kind: "length", params: { max: 80 } }] };
  const r = await f.svc.freeze({ issueId: ISSUE.id, issueKey: ISSUE.key, checksText: JSON.stringify(next), accountId: "557058:lead" });
  assert.equal(r.ok, true);
  assert.match(f.posted[0].text, /replace/);
  assert.ok(f.posted[0].text.includes(old));
});

test("a discussion comment is not judged: nothing is stored or posted", async () => {
  const f = await frozenService();
  assert.deepEqual(await f.svc.onComment(commentEvent("Looks good to me")), { skipped: "not a delivery" });
  assert.equal(f.posted.length, 0);
  assert.equal(f.kv.has("receipt:10007"), false);
});

test("the app's own comments are never judged", async () => {
  const f = await frozenService();
  assert.deepEqual(await f.svc.onComment(commentEvent(GOOD, { selfGenerated: true })), { skipped: "own event" });
  assert.equal(f.posted.length, 0);
});

test("a delivery in a comment only some people can see is not judged, so the public receipt cannot leak it", async () => {
  const f = await frozenService();
  const restricted = commentEvent(GOOD);
  restricted.comment.visibility = { type: "role", value: "Administrators", identifier: "10002" };
  assert.deepEqual(await f.svc.onComment(restricted), { skipped: "restricted comment" });
  const internal = commentEvent(GOOD);
  internal.comment.jsdPublic = false;
  assert.deepEqual(await f.svc.onComment(internal), { skipped: "restricted comment" });
  assert.equal(f.posted.length, 0);
  assert.equal(f.kv.has("receipt:10007"), false);
});

test("a delivery on a work item with no frozen checks is left alone", async () => {
  const f = fakes();
  assert.deepEqual(await f.svc.onComment(commentEvent(GOOD)), { skipped: "no checks frozen" });
  assert.equal(f.posted.length, 0);
});

test("a delivery comment is judged: the receipt is stored and posted, and the marker line is not checked", async () => {
  const f = await frozenService();
  const r = await f.svc.onComment(commentEvent(GOOD));
  assert.equal(r.receipt.core.pass, true);
  assert.equal(r.receipt.core.delivery.source, "comment");
  assert.equal(r.receipt.core.delivery.id, "500");
  assert.equal(f.kv.get("receipt:10007").receiptHash, r.receipt.receiptHash);
  assert.equal(f.posted.length, 1);
  assert.match(f.posted[0].text, /PASS/);
  assert.equal(r.receipt.core.delivery.bytes, Buffer.byteLength(GOOD.replace("Delivery:\n", "")));
});

test("a comment body in ADF is read the same way as plain text", async () => {
  const f = await frozenService();
  const adf = { type: "doc", version: 1, content: [
    { type: "paragraph", content: [{ type: "text", text: "Delivery:" }] },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Added" }] },
    { type: "paragraph", content: [{ type: "text", text: "CSV export" }] },
  ] };
  const r = await f.svc.onComment(commentEvent(adf));
  assert.equal(r.receipt.core.pass, false, "## Fixed is missing");
  assert.match(f.posted[0].text, /FAIL/);
  assert.match(f.posted[0].text, /## Fixed/);
});

test("an attachment added after the checks were frozen is judged from its bytes", async () => {
  const notes = Buffer.from("## Added\nCSV export\n## Fixed\nDate filter");
  const f = await frozenService({ attachments: { "20001": notes } });
  const event = { eventType: "avi:jira:updated:issue", selfGenerated: false, issue: ISSUE, changelog: { items: [{ field: "Attachment", fieldId: "attachment", to: "20001", toString: "notes.md" }] } };
  const r = await f.svc.onIssueUpdated(event);
  assert.equal(r.receipt.core.pass, true);
  assert.deepEqual({ source: r.receipt.core.delivery.source, id: r.receipt.core.delivery.id, name: r.receipt.core.delivery.name }, { source: "attachment", id: "20001", name: "notes.md" });
  assert.match(f.posted[0].text, /PASS/);
});

test("the file name comes from the attachment itself when the changelog does not carry one", async () => {
  const notes = Buffer.from("## Added\nCSV export\n## Fixed\nDate filter");
  const f = await frozenService({ attachments: { "20002": notes }, names: { "20002": "postmortem.md" } });
  const event = { selfGenerated: false, issue: ISSUE, changelog: { items: [{ fieldId: "attachment", to: "20002" }] } };
  const r = await f.svc.onIssueUpdated(event);
  assert.equal(r.receipt.core.delivery.name, "postmortem.md");
  assert.match(f.posted[0].text, /attachment postmortem\.md/);
});

test("an issue update without a new attachment is ignored, and an oversized attachment is reported, not judged", async () => {
  const f = await frozenService({ attachments: { big: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1) } });
  assert.deepEqual(await f.svc.onIssueUpdated({ selfGenerated: false, issue: ISSUE, changelog: { items: [{ field: "summary", to: "x" }] } }), { skipped: "no new attachment" });
  const r = await f.svc.onIssueUpdated({ selfGenerated: false, issue: ISSUE, changelog: { items: [{ fieldId: "attachment", to: "big", toString: "huge.bin" }] } });
  assert.deepEqual(r, { skipped: "attachment too large" });
  assert.match(f.posted[0].text, /huge\.bin/);
  assert.match(f.posted[0].text, /larger than/);
  assert.equal(f.kv.has("receipt:10007"), false);
});

test("the Done gate answers from the stored receipt: blocked with a reason, then allowed once a delivery passes", async () => {
  const f = await frozenService();
  const args = { issue: { key: ISSUE.key }, configuration: {}, transition: { from: { id: "3" }, to: { id: "10001" } } };
  let v = await f.svc.validate(args);
  assert.equal(v.result, false);
  assert.match(v.errorMessage, /No delivery has been checked/);
  await f.svc.onComment(commentEvent(BAD));
  v = await f.svc.validate(args);
  assert.equal(v.result, false);
  assert.match(v.errorMessage, /failed 1 of 2 checks/);
  await f.svc.onComment(commentEvent(GOOD));
  assert.deepEqual(await f.svc.validate(args), { result: true });
});

test("the Done gate lets work items without frozen checks through", async () => {
  const f = fakes();
  assert.deepEqual(await f.svc.validate({ issue: { key: ISSUE.key } }), { result: true });
});

test("a self-check runs the frozen checks on given text and stores or posts nothing", async () => {
  const f = await frozenService();
  const r = await f.svc.checkText({ issueId: ISSUE.id, issueKey: ISSUE.key, text: "## Added only" });
  assert.equal(r.ok, true);
  assert.equal(r.pass, false);
  assert.ok(r.results.some((x) => !x.pass && /## Fixed/.test(x.detail)));
  assert.equal(f.posted.length, 0);
  assert.equal(f.kv.has("receipt:10007"), false);
  const none = await fakes().svc.checkText({ issueId: ISSUE.id, issueKey: ISSUE.key, text: "x" });
  assert.deepEqual(none, { ok: false, error: "No acceptance checks are frozen on KAN-7." });
});

test("status reports the frozen checks in plain words, the latest receipt and the gate", async () => {
  const f = await frozenService();
  await f.svc.onComment(commentEvent(BAD));
  const s = await f.svc.status({ issueId: ISSUE.id, issueKey: ISSUE.key });
  assert.equal(s.frozen.checksHash, f.kv.get("checks:10007").checksHash);
  assert.deepEqual(s.checks, CHECKS.checks.map(describeCheck));
  assert.equal(s.receipt.core.pass, false);
  assert.equal(s.gate.allow, false);
});
