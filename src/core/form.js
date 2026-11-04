// The panel's simple form turned into checks: required text (one item per line) and word limits. It builds exactly
// what the JSON editor would, in a fixed order (required text, then length), so the same form gives the same hash.

import { LIMITS } from "./checkers.js";

export class FormError extends Error {}

function wholeNumber(raw, label) {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  if (!/^\d+$/.test(s)) throw new FormError(`${label} must be a whole number of words.`);
  return Number(s);
}

export function checksFromForm({ requiredText = "", wholeWords = false, minWords = "", maxWords = "" } = {}) {
  const terms = [...new Set(String(requiredText).split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
  if (terms.length > LIMITS.terms) throw new FormError(`At most ${LIMITS.terms} required lines.`);
  const min = wholeNumber(minWords, "Minimum words");
  const max = wholeNumber(maxWords, "Maximum words");
  if (min !== null && max !== null && min > max) throw new FormError("Minimum words cannot be more than maximum words.");

  const checks = [];
  if (terms.length) checks.push({ kind: "contains", params: wholeWords === true ? { all: terms, wholeWords: true } : { all: terms } });
  if (min !== null || max !== null) {
    checks.push({ kind: "length", params: { ...(min !== null ? { min } : {}), ...(max !== null ? { max } : {}), unit: "words" } });
  }
  if (checks.length === 0) throw new FormError("Add at least one check: some required text, or a word limit.");
  return { version: 1, checks };
}
