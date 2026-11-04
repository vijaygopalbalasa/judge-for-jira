// The frozen record: canonical JSON of the checks and its SHA-256. The hash is what a receipt cites, so the same
// checks must always give the same hash, and any change to them must give a different one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalize, checksHash, freezeRecord, FreezeError } from "../src/core/criteria.js";

const CHECKS = {
  version: 1,
  checks: [
    { kind: "contains", params: { all: ["## Added", "## Fixed"] } },
    { kind: "length", params: { max: 400, unit: "words" } },
  ],
};

test("canonical JSON sorts keys at every level and keeps array order", () => {
  assert.equal(canonicalize({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } }), '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}');
});

test("the hash is the SHA-256 of the canonical JSON, in lower-case hex", () => {
  const expected = createHash("sha256").update(canonicalize(CHECKS), "utf8").digest("hex");
  assert.equal(checksHash(CHECKS), expected);
  assert.match(checksHash(CHECKS), /^[0-9a-f]{64}$/);
});

test("key order does not change the hash, but any value change does", () => {
  const reordered = { checks: CHECKS.checks.map((c) => ({ params: c.params, kind: c.kind })), version: 1 };
  assert.equal(checksHash(reordered), checksHash(CHECKS));
  const looser = structuredClone(CHECKS);
  looser.checks[1].params.max = 401;
  assert.notEqual(checksHash(looser), checksHash(CHECKS));
  const swapped = { ...CHECKS, checks: [CHECKS.checks[1], CHECKS.checks[0]] };
  assert.notEqual(checksHash(swapped), checksHash(CHECKS), "check order is part of the record");
});

test("a member named __proto__ is hashed as data, never dropped", () => {
  const withProto = JSON.parse('{"version":1,"checks":[],"__proto__":{"x":1}}');
  assert.match(canonicalize(withProto), /"__proto__":\{"x":1\}/);
  assert.notEqual(checksHash(withProto), checksHash({ version: 1, checks: [] }));
});

test("freezing records the checks, their hash, who froze them and when", () => {
  const rec = freezeRecord(CHECKS, { accountId: "557058:abc", at: "2026-11-04T12:00:00.000Z" });
  assert.deepEqual(rec, {
    version: 1,
    checks: CHECKS,
    checksHash: checksHash(CHECKS),
    frozenBy: "557058:abc",
    frozenAt: "2026-11-04T12:00:00.000Z",
  });
});

test("freezing refuses checks the checker would refuse, and says why", () => {
  assert.throws(() => freezeRecord({ checks: [] }, { accountId: "a", at: "t" }), (e) => e instanceof FreezeError && /non-empty/.test(e.message));
  assert.throws(() => freezeRecord({ checks: [{ kind: "http-endpoint" }] }, { accountId: "a", at: "t" }), (e) => e instanceof FreezeError && /unknown kind/.test(e.message));
  assert.throws(() => freezeRecord("not checks", { accountId: "a", at: "t" }), FreezeError);
});

test("the frozen record is a copy: changing the input afterwards cannot change what was frozen", () => {
  const input = structuredClone(CHECKS);
  const rec = freezeRecord(input, { accountId: "a", at: "t" });
  input.checks[0].params.all.push("## Sneaky");
  assert.equal(rec.checks.checks[0].params.all.length, 2);
  assert.equal(rec.checksHash, checksHash(CHECKS));
});
