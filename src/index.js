// Forge entry points. All behaviour lives in service.js (tested with fakes); this file only connects it to Forge:
// key-value storage that only this app can read or write, and the Jira REST API.

import { asApp, asUser, route } from "@forge/api";
import { kvs } from "@forge/kvs";
import ResolverModule from "@forge/resolver";
import { createService } from "./service.js";

// @forge/resolver is CommonJS with a default export; as an ES module (package.json "type": "module") the
// default import is the whole module object, so take its default member when there is one.
const Resolver = ResolverModule.default ?? ResolverModule;

const JSON_HEADERS = { Accept: "application/json", "Content-Type": "application/json" };

async function expectOk(res, what) {
  if (!res.ok) throw new Error(`${what} failed: HTTP ${res.status}`);
  return res;
}

const jira = {
  async postComment(issueKey, adf) {
    await expectOk(await asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ body: adf }),
    }), "posting a comment");
  },
  async attachmentInfo(id) {
    const res = await expectOk(await asApp().requestJira(route`/rest/api/3/attachment/${id}`, { headers: { Accept: "application/json" } }), "reading attachment details");
    const j = await res.json();
    return { size: Number(j.size ?? 0), filename: typeof j.filename === "string" ? j.filename : "" };
  },
  async attachmentBytes(id) {
    const res = await expectOk(await asApp().requestJira(route`/rest/api/3/attachment/content/${id}`, { redirect: "follow" }), "downloading the attachment");
    return Buffer.from(await res.arrayBuffer());
  },
  async issueIdForKey(key) {
    const res = await asApp().requestJira(route`/rest/api/3/issue/${key}?fields=summary`, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()).id ?? null;
  },
};

const store = { get: (k) => kvs.get(k), set: (k, v) => kvs.set(k, v) };
const service = createService({ store, jira, now: () => new Date().toISOString() });

/* ---- Jira events and the Done gate ---- */

// One short log line per event: its shape and the outcome, never comment text or file contents.
const log = (fields) => console.log(JSON.stringify(fields));

export async function onComment(event) {
  log({ at: "comment", keys: Object.keys(event ?? {}), issue: event?.issue?.key, comment: Object.keys(event?.comment ?? {}), body: typeof event?.comment?.body });
  const r = await service.onComment(event);
  log({ at: "comment:done", skipped: r?.skipped, pass: r?.receipt?.core?.pass });
  return r;
}

export async function onIssueUpdated(event) {
  const items = Array.isArray(event?.changelog?.items) ? event.changelog.items : [];
  log({ at: "update", issue: event?.issue?.key, changes: items.map((i) => i?.fieldId ?? i?.field) });
  const r = await service.onIssueUpdated(event);
  log({ at: "update:done", skipped: r?.skipped, pass: r?.receipt?.core?.pass });
  return r;
}

export async function validateDone(args) {
  const r = await service.validate(args);
  log({ at: "gate", issue: args?.issue?.key, allow: r.result });
  return r;
}

/* ---- the issue panel ---- */

async function userCanEdit(issueId) {
  const res = await asUser().requestJira(route`/rest/api/3/mypermissions?issueId=${issueId}&permissions=EDIT_ISSUES`, { headers: { Accept: "application/json" } });
  if (!res.ok) return false;
  return (await res.json())?.permissions?.EDIT_ISSUES?.havePermission === true;
}

const resolver = new Resolver();
const panelIssue = (context) => context?.extension?.issue ?? {};

resolver.define("status", async ({ context }) => {
  const issue = panelIssue(context);
  return service.status({ issueId: String(issue.id), issueKey: issue.key });
});

resolver.define("freeze", async ({ payload, context }) => {
  const issue = panelIssue(context);
  if (!(await userCanEdit(String(issue.id)))) return { ok: false, error: "You need permission to edit this work item to freeze its checks." };
  return service.freeze({ issueId: String(issue.id), issueKey: issue.key, checksText: String(payload?.checksText ?? ""), accountId: context.accountId });
});

resolver.define("freezeForm", async ({ payload, context }) => {
  const issue = panelIssue(context);
  if (!(await userCanEdit(String(issue.id)))) return { ok: false, error: "You need permission to edit this work item to freeze its checks." };
  const form = payload?.form ?? {};
  return service.freezeForm({
    issueId: String(issue.id),
    issueKey: issue.key,
    form: { requiredText: String(form.requiredText ?? ""), wholeWords: form.wholeWords === true, minWords: String(form.minWords ?? ""), maxWords: String(form.maxWords ?? "") },
    accountId: context.accountId,
  });
});

export const resolverHandler = resolver.getDefinitions();

/* ---- Rovo actions, also served as MCP tools ---- */

// The work item as the calling user sees it: a user who cannot see the work item gets nothing back.
async function issueForUser(issueKey) {
  const key = String(issueKey ?? "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(key)) return null;
  const res = await asUser().requestJira(route`/rest/api/3/issue/${key}?fields=summary`, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const j = await res.json();
  return { id: String(j.id), key: j.key };
}

const NOT_FOUND = { error: "That work item was not found, or you do not have access to it. Use a key like KAN-12." };

export async function actionStatus(payload) {
  const issue = await issueForUser(payload?.issueKey);
  if (!issue) return NOT_FOUND;
  const s = await service.status({ issueId: issue.id, issueKey: issue.key });
  return {
    issue: issue.key,
    checksFrozen: Boolean(s.frozen),
    checks: s.checks,
    checksHash: s.frozen?.checksHash ?? null,
    frozenAt: s.frozen?.frozenAt ?? null,
    latestReceipt: s.receipt
      ? {
        pass: s.receipt.core.pass,
        score: s.receipt.core.score,
        results: s.receipt.core.results.map(({ label, pass, detail }) => ({ label, pass, detail })),
        delivery: s.receipt.core.delivery,
        checkedAt: s.receipt.checkedAt,
        receiptHash: s.receipt.receiptHash,
      }
      : null,
    mayMoveToDone: s.gate.allow,
    gateMessage: s.gate.message,
  };
}

export async function actionCheck(payload) {
  const issue = await issueForUser(payload?.issueKey);
  if (!issue) return NOT_FOUND;
  return service.checkText({ issueId: issue.id, issueKey: issue.key, text: payload?.text });
}
