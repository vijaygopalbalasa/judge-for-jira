// The frozen record of a work item's acceptance checks. The checks are hashed as canonical JSON (keys sorted at
// every level, arrays in order), so the same checks always give the same SHA-256 and any change gives another.
// A receipt cites this hash, which is how anyone can tell the checks did not move after the work started.

import { createHash } from "node:crypto";
import { validateCriteria } from "./checkers.js";

export class FreezeError extends Error {}

function sortKeys(x) {
  if (Array.isArray(x)) return x.map(sortKeys);
  if (x && typeof x === "object") {
    // A null-prototype accumulator: on a plain {} the key "__proto__" would hit the prototype setter and
    // vanish from the hash instead of being hashed as data.
    return Object.keys(x).sort().reduce((acc, k) => {
      acc[k] = sortKeys(x[k]);
      return acc;
    }, Object.create(null));
  }
  return x;
}

export function canonicalize(value) {
  return JSON.stringify(sortKeys(value));
}

export function checksHash(checks) {
  return createHash("sha256").update(canonicalize(checks), "utf8").digest("hex");
}

/** The record stored when checks are frozen. Refuses checks the checker would refuse. */
export function freezeRecord(checks, { accountId, at }) {
  const v = validateCriteria(checks);
  if (!v.valid) throw new FreezeError(v.reason);
  const copy = JSON.parse(canonicalize(checks));
  return { version: 1, checks: copy, checksHash: checksHash(copy), frozenBy: accountId, frozenAt: at };
}
