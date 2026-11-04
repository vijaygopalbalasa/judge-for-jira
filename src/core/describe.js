// Each check in plain words, for the panel, the freeze comment and the agent. Wording only: never part of a verdict.

const quote = (s) => `"${s}"`;
const article = (type) => (type === "object" ? "an object" : `a ${type}`);
const present = (v) => v !== undefined && v !== null;

function lengthText(p) {
  const unit = p.unit === "chars" ? "character" : "word";
  const count = (n) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  const hasMin = present(p.min) && p.min > 0;
  const hasMax = present(p.max);
  if (hasMin && hasMax) return `Between ${p.min} and ${count(p.max)}`;
  if (hasMax) return `At most ${count(p.max)}`;
  if (hasMin) return `At least ${count(p.min)}`;
  return "Any length";
}

function schemaText(p) {
  const fields = Array.isArray(p.required) && p.required.length ? ` with fields: ${p.required.join(", ")}` : "";
  const types = Object.entries(p.types ?? {}).map(([f, type]) => `${f} is ${article(type)}`);
  return `JSON object${fields}${types.length ? ` (${types.join(", ")})` : ""}`;
}

export function describeCheck(check) {
  const p = check?.params ?? {};
  let text;
  switch (check?.kind) {
    case "contains": text = `Must include${p.wholeWords === true ? ", as whole words" : ""}: ${(p.all ?? []).map(quote).join(", ")}`; break;
    case "length": text = lengthText(p); break;
    case "schema": text = schemaText(p); break;
    case "json": text = "JSON in the agreed shape"; break;
    case "checksum": text = `Exactly the file with SHA-256 ${String(p.sha256 ?? "").slice(0, 12)}…`; break;
    default: return `Unknown check: ${check?.kind}`;
  }
  return present(check.weight) && check.weight !== 1 ? `${text} (weight ${check.weight})` : text;
}
