// ADF (Atlassian Document Format) to plain text, the one fixed way. A comment's text is what the checks read, so
// this conversion is part of the verdict: the same document must always give the same text. Headings, lists,
// quotes, rules and code blocks keep Markdown-style markers, so "## Added" is found whether it was typed as a
// heading or pasted as text. Media is skipped; links become their URL; mentions become their display text.

export class AdfError extends Error {}

const MAX_DEPTH = 100;
const INLINE = new Set(["text", "hardBreak", "mention", "emoji", "status", "date", "inlineCard", "placeholder", "mediaInline", "inlineExtension"]);
const SKIPPED = new Set(["media", "mediaSingle", "mediaGroup", "mediaInline", "placeholder"]);

const isNode = (n) => n !== null && typeof n === "object" && !Array.isArray(n) && typeof n.type === "string";
const str = (v) => (typeof v === "string" ? v : "");

function childrenOf(node) {
  if (node.content === undefined) return [];
  if (!Array.isArray(node.content)) throw new AdfError(`${node.type}: content must be a list`);
  for (const c of node.content) if (!isNode(c)) throw new AdfError(`${node.type}: every child must be a node with a type`);
  return node.content;
}

function deeper(depth) {
  if (depth > MAX_DEPTH) throw new AdfError(`the document nests deeper than ${MAX_DEPTH} levels`);
  return depth + 1;
}

function dateText(ts) {
  const ms = Number(ts);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function inline(node, depth) {
  const d = deeper(depth);
  const a = node.attrs && typeof node.attrs === "object" ? node.attrs : {};
  switch (node.type) {
    case "text": return str(node.text);
    case "hardBreak": return "\n";
    case "mention": return str(a.text) || `@${str(a.id)}`;
    case "emoji": return str(a.text) || str(a.shortName);
    case "status": return str(a.text);
    case "date": return dateText(a.timestamp);
    case "inlineCard": return str(a.url);
    default:
      if (SKIPPED.has(node.type)) return "";
      return childrenOf(node).map((c) => inline(c, d)).join("");
  }
}

const inlineOf = (node, depth) => childrenOf(node).map((c) => inline(c, depth)).join("");
const indent = (lines, first, rest) => lines.map((l, i) => (i === 0 ? first : rest) + l);

function listItemLines(item, depth) {
  const lines = childrenOf(item).flatMap((c) => block(c, depth));
  return lines.length ? lines : [""];
}

function block(node, depth) {
  const d = deeper(depth);
  const a = node.attrs && typeof node.attrs === "object" ? node.attrs : {};
  if (INLINE.has(node.type)) {
    const text = inline(node, depth);
    return text === "" ? [] : text.split("\n");
  }
  switch (node.type) {
    case "paragraph": return inlineOf(node, d).split("\n");
    case "heading": {
      const level = Number.isInteger(a.level) ? Math.min(Math.max(a.level, 1), 6) : 1;
      return [`${"#".repeat(level)} ${inlineOf(node, d).replace(/\n/g, " ")}`];
    }
    case "bulletList":
      return childrenOf(node).flatMap((item) => indent(listItemLines(item, d), "- ", "  "));
    case "orderedList": {
      const start = Number.isInteger(a.order) && a.order >= 0 ? a.order : 1;
      return childrenOf(node).flatMap((item, i) => indent(listItemLines(item, d), `${start + i}. `, "  "));
    }
    case "codeBlock":
      return ["```" + str(a.language), ...inlineOf(node, d).split("\n"), "```"];
    case "blockquote":
      return childrenOf(node).flatMap((c) => block(c, d)).map((l) => `> ${l}`);
    case "rule": return ["---"];
    case "table":
      return childrenOf(node).map((row) => childrenOf(row).map((cell) => childrenOf(cell).flatMap((c) => block(c, d)).join(" ")).join(" | "));
    case "expand":
    case "nestedExpand":
      return [...(str(a.title) ? [str(a.title)] : []), ...childrenOf(node).flatMap((c) => block(c, d))];
    case "taskList":
      return childrenOf(node).flatMap((c) => (c.type === "taskList" ? block(c, d).map((l) => `  ${l}`) : [`${c.attrs?.state === "DONE" ? "[x]" : "[ ]"} ${inlineOf(c, d)}`]));
    case "decisionList":
      return childrenOf(node).map((c) => `> ${inlineOf(c, d)}`);
    case "blockCard":
    case "embedCard":
      return str(a.url) ? [str(a.url)] : [];
    default:
      if (SKIPPED.has(node.type)) return [];
      return childrenOf(node).flatMap((c) => block(c, d));
  }
}

/** The text of an ADF document. Throws AdfError for anything that is not a well-formed document. */
export function adfToText(doc) {
  if (!isNode(doc) || doc.type !== "doc") throw new AdfError("not an ADF document (expected type \"doc\")");
  if (!Array.isArray(doc.content)) throw new AdfError("an ADF document needs a content list");
  return childrenOf(doc).flatMap((c) => block(c, 0)).join("\n");
}
