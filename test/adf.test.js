// A Jira comment arrives as ADF (Atlassian Document Format). The checker reads text, so the conversion must be
// fixed and exact: the same document always gives the same text, headings keep a Markdown-style marker so a
// required section can be checked whether it was typed as a heading or pasted as "## Title".
import { test } from "node:test";
import assert from "node:assert/strict";
import { adfToText, AdfError } from "../src/core/adf.js";

const doc = (...content) => ({ type: "doc", version: 1, content });
const p = (...content) => ({ type: "paragraph", content });
const t = (text, marks) => (marks ? { type: "text", text, marks } : { type: "text", text });
const h = (level, text) => ({ type: "heading", attrs: { level }, content: [t(text)] });
const li = (...content) => ({ type: "listItem", content });

test("paragraphs become lines, and marks do not change the text", () => {
  assert.equal(adfToText(doc(p(t("Hello "), t("world", [{ type: "strong" }])), p(t("Second line")))), "Hello world\nSecond line");
});

test("headings keep a Markdown-style marker for their level", () => {
  assert.equal(adfToText(doc(h(2, "Added"), p(t("New export button")), h(3, "Fixed"))), "## Added\nNew export button\n### Fixed");
});

test("a hard break is a new line, and an empty paragraph is an empty line", () => {
  assert.equal(adfToText(doc(p(t("a"), { type: "hardBreak" }, t("b")), { type: "paragraph" }, p(t("c")))), "a\nb\n\nc");
});

test("bullet and numbered lists, nested lists indent by two spaces, numbering honours a start value", () => {
  const nested = { type: "bulletList", content: [li(p(t("inner")))] };
  const text = adfToText(doc(
    { type: "bulletList", content: [li(p(t("one"))), li(p(t("two")), nested)] },
    { type: "orderedList", attrs: { order: 3 }, content: [li(p(t("three"))), li(p(t("four")))] },
  ));
  assert.equal(text, "- one\n- two\n  - inner\n3. three\n4. four");
});

test("mentions, emoji, status, dates and links become readable text", () => {
  const text = adfToText(doc(p(
    { type: "mention", attrs: { id: "557058:abc", text: "@Vijay" } }, t(" "),
    { type: "mention", attrs: { id: "557058:xyz" } }, t(" "),
    { type: "emoji", attrs: { shortName: ":tada:", text: "🎉" } }, t(" "),
    { type: "emoji", attrs: { shortName: ":custom:" } }, t(" "),
    { type: "status", attrs: { text: "DONE", color: "green" } }, t(" "),
    { type: "date", attrs: { timestamp: "1793750400000" } }, t(" "),
    { type: "inlineCard", attrs: { url: "https://example.com/spec" } },
  )));
  assert.equal(text, "@Vijay @557058:xyz 🎉 :custom: DONE 2026-11-04 https://example.com/spec");
});

test("code blocks are fenced, quotes and rules use Markdown markers, tables join cells with a bar", () => {
  const table = { type: "table", content: [
    { type: "tableRow", content: [{ type: "tableHeader", content: [p(t("Key"))] }, { type: "tableHeader", content: [p(t("Value"))] }] },
    { type: "tableRow", content: [{ type: "tableCell", content: [p(t("a"))] }, { type: "tableCell", content: [p(t("1"))] }] },
  ] };
  const text = adfToText(doc(
    { type: "codeBlock", attrs: { language: "json" }, content: [t('{"ok":true}')] },
    { type: "blockquote", content: [p(t("quoted")), p(t("twice"))] },
    { type: "rule" },
    table,
  ));
  assert.equal(text, '```json\n{"ok":true}\n```\n> quoted\n> twice\n---\nKey | Value\na | 1');
});

test("panels, expands, task and decision lists keep their text; media is skipped", () => {
  const text = adfToText(doc(
    { type: "panel", attrs: { panelType: "info" }, content: [p(t("Note"))] },
    { type: "expand", attrs: { title: "Details" }, content: [p(t("Hidden"))] },
    { type: "taskList", content: [{ type: "taskItem", attrs: { state: "DONE" }, content: [t("ship it")] }, { type: "taskItem", attrs: { state: "TODO" }, content: [t("tell them")] }] },
    { type: "decisionList", content: [{ type: "decisionItem", content: [t("use v2")] }] },
    { type: "mediaSingle", content: [{ type: "media", attrs: { id: "x", type: "file" } }] },
  ));
  assert.equal(text, "Note\nDetails\nHidden\n[x] ship it\n[ ] tell them\n> use v2");
});

test("unknown node types keep the text inside them, and unknown leaves add nothing", () => {
  assert.equal(adfToText(doc({ type: "futureBlock", content: [p(t("kept"))] }, { type: "futureLeaf" })), "kept");
});

test("the same document always gives the same text", () => {
  const d = doc(h(1, "Release 2.3"), { type: "bulletList", content: [li(p(t("x")))] });
  assert.equal(adfToText(structuredClone(d)), adfToText(d));
});

test("what is not an ADF document is refused, never guessed at", () => {
  for (const bad of [null, "text", 42, {}, { type: "paragraph" }, { type: "doc", content: "nope" }]) {
    assert.throws(() => adfToText(bad), AdfError, JSON.stringify(bad));
  }
});

test("a document nested absurdly deep is refused instead of overflowing the stack", () => {
  let node = t("deep");
  for (let i = 0; i < 5000; i++) node = { type: "blockquote", content: [node] };
  assert.throws(() => adfToText(doc(node)), AdfError);
});
