// What the app does, with Jira and storage passed in, so every path is tested without a Jira site
// (test/service.test.js). src/index.js passes the real Forge APIs.
//   store: { get(key), set(key, value) }            Forge key-value storage, private to the app
//   jira:  { postComment(issueKey, adf), attachmentSize(id), attachmentBytes(id), issueIdForKey(key) }
//   now:   () => ISO time

import { adfToText, AdfError } from "./core/adf.js";
import { deliveryFromComment, addedAttachments } from "./core/delivery.js";
import { freezeRecord, FreezeError } from "./core/criteria.js";
import { evaluate, gateDecision, receiptComment } from "./core/receipt.js";
import { describeCheck } from "./core/describe.js";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const checksKey = (issueId) => `checks:${issueId}`;
const receiptKey = (issueId) => `receipt:${issueId}`;

const text = (t, marks) => (marks ? { type: "text", text: t, marks } : { type: "text", text: t });
const code = (t) => text(t, [{ type: "code" }]);
const para = (...content) => ({ type: "paragraph", content });
const doc = (...content) => ({ type: "doc", version: 1, content: content.filter(Boolean) });

function freezeComment(record, previous) {
  const checks = record.checks.checks;
  return doc(
    para(text("🔒 Acceptance checks frozen", [{ type: "strong" }]), text(` · ${checks.length} check${checks.length === 1 ? "" : "s"}`)),
    { type: "bulletList", content: checks.map((c) => ({ type: "listItem", content: [para(text(describeCheck(c)))] })) },
    para(text("Every delivery is checked against exactly these checks. A delivery is an attachment, or a comment that starts with \"Delivery\".")),
    previous ? para(text("These replace the checks frozen earlier ("), code(previous.checksHash), text(").")) : null,
    para(text("Checks "), code(record.checksHash)),
  );
}

const tooLargeComment = (name) => doc(para(text(`Judge could not check ${name}: it is larger than ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB.`)));

function commentText(body) {
  if (typeof body === "string") return body;
  try {
    return adfToText(body);
  } catch (e) {
    if (e instanceof AdfError) return null;
    throw e;
  }
}

export function createService({ store, jira, now }) {
  async function judge(issue, frozen, delivery) {
    const receipt = await evaluate({ issueKey: issue.key, frozen, delivery, at: now() });
    await store.set(receiptKey(issue.id), receipt);
    await jira.postComment(issue.key, receiptComment(receipt));
    return { receipt };
  }

  return {
    async freeze({ issueId, issueKey, checksText, accountId }) {
      let parsed;
      try {
        parsed = JSON.parse(checksText);
      } catch {
        return { ok: false, error: "The checks are not valid JSON." };
      }
      let record;
      try {
        record = freezeRecord(parsed, { accountId, at: now() });
      } catch (e) {
        if (e instanceof FreezeError) return { ok: false, error: e.message };
        throw e;
      }
      const previous = await store.get(checksKey(issueId));
      if (previous && previous.checksHash === record.checksHash) return { ok: true, record: previous, unchanged: true };
      await store.set(checksKey(issueId), record);
      await jira.postComment(issueKey, freezeComment(record, previous));
      return { ok: true, record };
    },

    async onComment(event) {
      if (event?.selfGenerated) return { skipped: "own event" };
      // A comment limited to a role or group (or a service desk internal note) is never judged: the receipt is a
      // public comment and the panel shows it to everyone who can see the work item, so it could leak the content.
      if (event?.comment?.visibility || event?.comment?.jsdPublic === false) return { skipped: "restricted comment" };
      const body = commentText(event?.comment?.body);
      if (body === null) return { skipped: "unreadable comment" };
      const delivered = deliveryFromComment(body);
      if (delivered === null) return { skipped: "not a delivery" };
      const frozen = await store.get(checksKey(event.issue.id));
      if (!frozen) return { skipped: "no checks frozen" };
      return judge(event.issue, frozen, { source: "comment", id: event.comment.id, content: delivered });
    },

    async onIssueUpdated(event) {
      if (event?.selfGenerated) return { skipped: "own event" };
      const added = addedAttachments(event?.changelog);
      if (added.length === 0) return { skipped: "no new attachment" };
      const frozen = await store.get(checksKey(event.issue.id));
      if (!frozen) return { skipped: "no checks frozen" };
      const att = added[added.length - 1];
      if ((await jira.attachmentSize(att.id)) > MAX_ATTACHMENT_BYTES) {
        await jira.postComment(event.issue.key, tooLargeComment(att.name || att.id));
        return { skipped: "attachment too large" };
      }
      const bytes = await jira.attachmentBytes(att.id);
      return judge(event.issue, frozen, { source: "attachment", id: att.id, name: att.name, content: bytes });
    },

    async validate(args) {
      const key = args?.issue?.key;
      const issueId = key ? await jira.issueIdForKey(key) : null;
      if (!issueId) return { result: false, errorMessage: "Judge could not read this work item, so it cannot confirm its acceptance checks. Try again." };
      const frozen = (await store.get(checksKey(issueId))) ?? null;
      const receipt = frozen ? (await store.get(receiptKey(issueId))) ?? null : null;
      const d = gateDecision({ frozen, receipt });
      return d.allow ? { result: true } : { result: false, errorMessage: d.message };
    },

    async status({ issueId }) {
      const frozen = (await store.get(checksKey(issueId))) ?? null;
      const receipt = (await store.get(receiptKey(issueId))) ?? null;
      return { frozen, checks: frozen ? frozen.checks.checks.map(describeCheck) : [], receipt, gate: gateDecision({ frozen, receipt }) };
    },

    async checkText({ issueId, issueKey, text: delivered }) {
      const frozen = await store.get(checksKey(issueId));
      if (!frozen) return { ok: false, error: `No acceptance checks are frozen on ${issueKey}.` };
      const raw = String(delivered ?? "");
      const content = deliveryFromComment(raw) ?? raw;
      const r = await evaluate({ issueKey, frozen, delivery: { source: "self-check", id: "-", content }, at: now() });
      return { ok: true, pass: r.core.pass, score: r.core.score, results: r.core.results, checksHash: frozen.checksHash };
    },
  };
}
