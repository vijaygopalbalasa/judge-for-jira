// What counts as a delivery. Not every comment is one: a discussion comment must not be judged. A comment is a
// delivery when its first line starts with the word "Delivery"; an attachment added to the work item always is.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryFromComment, addedAttachments } from "../src/core/delivery.js";

test("a comment whose first line starts with the word Delivery is a delivery, and the marker is not part of it", () => {
  assert.equal(deliveryFromComment("Delivery:\n## Added\nExport"), "## Added\nExport");
  assert.equal(deliveryFromComment("delivery: here it is"), "here it is");
  assert.equal(deliveryFromComment("DELIVERY - v2 notes"), "v2 notes");
  assert.equal(deliveryFromComment("\n\n  Delivery\n\nBody"), "\nBody");
  assert.equal(deliveryFromComment("Delivery"), "");
});

test("anything else is a discussion comment and is not judged", () => {
  for (const c of ["Deliveryman came by", "Re: delivery", "Looks good", "", "  ", "The Delivery: is below"]) {
    assert.equal(deliveryFromComment(c), null, JSON.stringify(c));
  }
  assert.equal(deliveryFromComment(null), null);
  assert.equal(deliveryFromComment(42), null);
});

test("attachments added in an issue update are found in its changelog; removals are ignored", () => {
  const changelog = { items: [
    { field: "Attachment", fieldId: "attachment", from: null, fromString: null, to: "10001", toString: "notes.md" },
    { field: "Attachment", fieldId: "attachment", from: "9000", fromString: "old.md", to: null, toString: null },
    { field: "status", fieldId: "status", from: "1", to: "3", toString: "In Progress" },
  ] };
  assert.deepEqual(addedAttachments(changelog), [{ id: "10001", name: "notes.md" }]);
});

test("a changelog with no attachment changes, or none at all, adds nothing", () => {
  assert.deepEqual(addedAttachments({ items: [{ field: "summary", to: null }] }), []);
  assert.deepEqual(addedAttachments(undefined), []);
  assert.deepEqual(addedAttachments({ items: "nope" }), []);
});
