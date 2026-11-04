// Minimal, faithful evaluator for the DynamoDB ConditionExpression / UpdateExpression subset
// the content handler uses. Lets handler tests model REAL conditional-write semantics (which
// is what makes quota reservation concurrency-safe) instead of hand-coding each call shape.
//
// Supported conditions: OR / AND of atoms
//   attribute_not_exists(a) | attribute_exists(a) | a = :v | a <> :v | a < :v | a <= :v | a > :v | a >= :v
// Supported updates: SET a = :v | a = b + :v | a = b - :v | a = if_not_exists(b, :d) + :v  (comma-separated)

type Item = Record<string, any>;
type Vals = Record<string, any>;

function resolveName(tok: string, names?: Record<string, string>) {
  return tok.startsWith('#') ? names?.[tok] ?? tok : tok;
}

function atom(expr: string, item: Item | undefined, vals: Vals, names?: Record<string, string>): boolean {
  const e = expr.trim().replace(/^\((.*)\)$/, '$1').trim();
  let m = e.match(/^attribute_not_exists\((\S+)\)$/);
  if (m) return !item || item[resolveName(m[1], names)] === undefined;
  m = e.match(/^attribute_exists\((\S+)\)$/);
  if (m) return !!item && item[resolveName(m[1], names)] !== undefined;
  m = e.match(/^(\S+)\s*(<>|<=|>=|=|<|>)\s*(:\w+)$/);
  if (!m) throw new Error(`ddbExpr: unsupported condition atom "${e}"`);
  const left = item?.[resolveName(m[1], names)];
  const right = vals[m[3]];
  if (left === undefined) return m[2] === '<>'; // DynamoDB: comparisons on a missing attr are false (<> true)
  switch (m[2]) {
    case '=': return left === right;
    case '<>': return left !== right;
    case '<': return left < right;
    case '<=': return left <= right;
    case '>': return left > right;
    case '>=': return left >= right;
  }
  return false;
}

export function evalCondition(expr: string | undefined, item: Item | undefined, vals: Vals = {}, names?: Record<string, string>): boolean {
  if (!expr) return true;
  return expr.split(/\s+OR\s+/).some((orPart) => orPart.split(/\s+AND\s+/).every((a) => atom(a, item, vals, names)));
}

export function applyUpdate(item: Item | undefined, expr: string, vals: Vals = {}, names?: Record<string, string>): Item {
  const next: Item = { ...(item || {}) };
  const setPart = expr.replace(/^SET\s+/i, '');
  for (const assign of setPart.split(/,(?![^()]*\))/)) {
    const [lhsRaw, rhsRaw] = assign.split('=').map((s) => s.trim());
    const lhs = resolveName(lhsRaw, names);
    let m = rhsRaw.match(/^if_not_exists\((\S+),\s*(:\w+)\)\s*([+-])\s*(:\w+)$/);
    if (m) {
      const base = next[resolveName(m[1], names)] ?? vals[m[2]];
      next[lhs] = m[3] === '+' ? base + vals[m[4]] : base - vals[m[4]];
      continue;
    }
    m = rhsRaw.match(/^(\S+)\s*([+-])\s*(:\w+)$/);
    if (m && !m[1].startsWith(':')) {
      const base = next[resolveName(m[1], names)];
      if (base === undefined) throw new Error(`ddbExpr: arithmetic on missing attribute ${m[1]}`);
      next[lhs] = m[2] === '+' ? base + vals[m[3]] : base - vals[m[3]];
      continue;
    }
    if (/^:\w+$/.test(rhsRaw)) { next[lhs] = vals[rhsRaw]; continue; }
    throw new Error(`ddbExpr: unsupported update "${assign}"`);
  }
  return next;
}

/** A ConditionalCheckFailedException like the real SDK throws. */
export function ccf(): Error {
  const e: any = new Error('The conditional request failed');
  e.name = 'ConditionalCheckFailedException';
  return e;
}
