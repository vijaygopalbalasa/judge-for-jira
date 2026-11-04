// The panel's simple form: required text, one item per line, and word limits. It builds the same checks the JSON
// editor would, so nobody has to write JSON to set acceptance checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checksFromForm, FormError } from "../src/core/form.js";
import { validateCriteria } from "../src/core/checkers.js";

test("required text lines become one contains check, trimmed, with blank lines and repeats dropped", () => {
  const c = checksFromForm({ requiredText: "## Summary\n\n  ## How it was tested  \n## Summary\n", maxWords: "" });
  assert.deepEqual(c, { version: 1, checks: [{ kind: "contains", params: { all: ["## Summary", "## How it was tested"] } }] });
  assert.equal(validateCriteria(c).valid, true);
});

test("whole words is passed through only when asked for", () => {
  const c = checksFromForm({ requiredText: "KAN-7", wholeWords: true });
  assert.deepEqual(c.checks, [{ kind: "contains", params: { all: ["KAN-7"], wholeWords: true } }]);
});

test("word limits become one length check in words", () => {
  assert.deepEqual(checksFromForm({ maxWords: "400" }).checks, [{ kind: "length", params: { max: 400, unit: "words" } }]);
  assert.deepEqual(checksFromForm({ minWords: "50", maxWords: "400" }).checks, [{ kind: "length", params: { min: 50, max: 400, unit: "words" } }]);
  assert.deepEqual(checksFromForm({ minWords: "50" }).checks, [{ kind: "length", params: { min: 50, unit: "words" } }]);
});

test("both parts together keep a fixed order: required text first, then length", () => {
  const c = checksFromForm({ requiredText: "## Summary", minWords: " 10 ", maxWords: "200" });
  assert.deepEqual(c.checks.map((x) => x.kind), ["contains", "length"]);
  assert.equal(validateCriteria(c).valid, true);
});

test("a word limit that is not a whole number, or min above max, is refused with a plain reason", () => {
  for (const [form, re] of [
    [{ maxWords: "four hundred" }, /whole number/],
    [{ maxWords: "-5" }, /whole number/],
    [{ maxWords: "2.5" }, /whole number/],
    [{ minWords: "500", maxWords: "400" }, /cannot be more than/],
  ]) {
    assert.throws(() => checksFromForm(form), (e) => e instanceof FormError && re.test(e.message), JSON.stringify(form));
  }
});

test("an empty form is refused: there must be at least one check", () => {
  assert.throws(() => checksFromForm({ requiredText: " \n ", maxWords: "", minWords: "" }), (e) => e instanceof FormError && /at least one/.test(e.message));
});

test("more required lines than the checker allows are refused rather than cut", () => {
  const lines = Array.from({ length: 257 }, (_, i) => `term ${i}`).join("\n");
  assert.throws(() => checksFromForm({ requiredText: lines }), (e) => e instanceof FormError && /256/.test(e.message));
});
