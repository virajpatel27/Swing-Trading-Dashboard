/* Scanner rules in the browser (Phase S6) - the same rules as swingdash/scanners.py (a test runs both on the same rows).
   Node: {all:[...]} | {any:[...]} | {field, op, value} | {field, op, field2, mult}. A missing value never matches. */
(function (root) {
  "use strict";
  const OPS = { ">": (a, b) => a > b, ">=": (a, b) => a >= b, "<": (a, b) => a < b, "<=": (a, b) => a <= b,
    "==": (a, b) => a === b, "!=": (a, b) => a !== b };
  const OP_TEXT = { ">": "above", ">=": "at least", "<": "below", "<=": "at most", "==": "equal to", "!=": "not", is: "is",
    between: "between", in: "is one of" };
  const num = (x) => (x == null || x === "" || typeof x === "boolean" ? NaN : Number(x));
  const fmt = (x) => String(Number(x));

  function cond(r, c) {
    const v = r[c.field];
    if (c.op === "is") return v != null && !Number.isNaN(v) && Boolean(v) === Boolean(c.value === undefined ? true : c.value);
    if (c.op === "in") return v != null && c.value.map(String).includes(String(v));
    const a = num(v);
    if (Number.isNaN(a)) return false;
    if (c.op === "between") return a >= c.value[0] && a <= c.value[1];
    const b = c.field2 ? num(r[c.field2]) * (c.mult == null ? 1 : Number(c.mult)) : Number(c.value);
    if (Number.isNaN(b)) return false;
    return OPS[c.op] ? OPS[c.op](a, b) : false;
  }
  function test(r, node) {
    if (node.all) return node.all.every((n) => test(r, n));
    if (node.any) return node.any.some((n) => test(r, n));
    return cond(r, node);
  }
  /** rows a scanner finds (stale stocks never; universe "liquid" = liquid that day) */
  function run(rows, sc) {
    const rule = sc.rule || { all: [] };
    return rows.filter((r) => !r.stale && (sc.universe !== "liquid" || (r.liquid_day != null ? r.liquid_day : r.liquid)) && test(r, rule));
  }
  function fieldsIn(node) {
    if (node.all || node.any) return (node.all || node.any).flatMap(fieldsIn);
    return [node.field, ...(node.field2 ? [node.field2] : [])];
  }
  /** plain English, the same text as scanners.describe() in Python */
  function describe(node, labels = {}, depth = 0) {
    if (node.all || node.any) {
      const parts = (node.all || node.any).map((n) => describe(n, labels, depth + 1));
      if (!parts.length) return "every stock";
      const j = parts.join(node.all ? " AND " : " OR ");
      return depth && parts.length > 1 ? `(${j})` : j;
    }
    const lab = labels[node.field] || node.field;
    if (node.op === "is") return node.value === false ? `not ${lab}` : lab;
    if (node.op === "in") return `${lab} is one of ${node.value.join(", ")}`;
    if (node.op === "between") return `${lab} between ${fmt(node.value[0])} and ${fmt(node.value[1])}`;
    const m = node.mult == null ? 1 : Number(node.mult);
    const rhs = node.field2 ? (labels[node.field2] || node.field2) + (m === 1 ? "" : ` x ${fmt(m)}`) : fmt(node.value);
    return `${lab} ${OP_TEXT[node.op]} ${rhs}`;
  }
  /** problems of a (user-edited) scanner against the list of known fields */
  function validate(sc, known) {
    const out = [];
    for (const f of fieldsIn(sc.rule || { all: [] })) if (!known.has(f)) out.push(`unknown field ${f}`);
    return out;
  }

  const api = { OP_TEXT, cond, test, run, fieldsIn, describe, validate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SDS = api;
})(typeof self !== "undefined" ? self : this);
