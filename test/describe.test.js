// Each check in plain words, for the panel, the freeze comment and the agent. Wording only: never part of a verdict.
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeCheck } from "../src/core/describe.js";

test("each kind of check reads as one plain sentence", () => {
  assert.equal(describeCheck({ kind: "contains", params: { all: ["## Added", "KAN-7"] } }), 'Must include: "## Added", "KAN-7"');
  assert.equal(describeCheck({ kind: "contains", params: { all: ["Arc"], wholeWords: true } }), 'Must include, as whole words: "Arc"');
  assert.equal(describeCheck({ kind: "length", params: { max: 400 } }), "At most 400 words");
  assert.equal(describeCheck({ kind: "length", params: { min: 10, max: 400, unit: "words" } }), "Between 10 and 400 words");
  assert.equal(describeCheck({ kind: "length", params: { min: 1, unit: "chars" } }), "At least 1 character");
  assert.equal(describeCheck({ kind: "length", params: {} }), "Any length");
  assert.equal(describeCheck({ kind: "schema", params: { required: ["id", "total"], types: { total: "number" } } }), "JSON object with fields: id, total (total is a number)");
  assert.equal(describeCheck({ kind: "json", params: { shape: { type: "array" } } }), "JSON in the agreed shape");
  assert.equal(describeCheck({ kind: "checksum", params: { sha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08" } }), "Exactly the file with SHA-256 9f86d081884c…");
});

test("a weight other than 1 is shown, and an unknown kind is named rather than hidden", () => {
  assert.equal(describeCheck({ kind: "length", params: { max: 5 }, weight: 3 }), "At most 5 words (weight 3)");
  assert.equal(describeCheck({ kind: "mystery" }), "Unknown check: mystery");
});
