// What counts as a delivery. A comment is one only when its first line starts with the word "Delivery" (any case),
// so discussion comments are never judged; the marker and one separator (":" or "-") and one line break after it
// are not part of what is checked. An attachment added to the work item is always a delivery.

const MARKER = /^\s*delivery(?=$|[\s:-])[ \t]*[:-]?[ \t]*(?:\r?\n)?/i;

/** The delivered text of a comment, or null when the comment is not a delivery. */
export function deliveryFromComment(text) {
  if (typeof text !== "string") return null;
  const m = MARKER.exec(text);
  return m ? text.slice(m[0].length) : null;
}

/** Attachments added in an issue update, from its changelog: [{ id, name }]. Removals are ignored. */
export function addedAttachments(changelog) {
  const items = Array.isArray(changelog?.items) ? changelog.items : [];
  return items
    .filter((i) => (i?.fieldId === "attachment" || i?.field === "Attachment") && i.to !== null && i.to !== undefined)
    .map((i) => ({ id: String(i.to), name: String(i.toString ?? "") }));
}
