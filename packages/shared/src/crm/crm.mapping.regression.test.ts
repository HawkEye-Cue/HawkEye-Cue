// Focused regression for the CRM payload/CSV `__proto__` edge case.
//
// A destination field literally named "__proto__" used to be lost: buildPayload wrote
// `out["__proto__"] = ...` on a plain {} object, which mutates the prototype instead of
// creating an own-enumerable key, so the column vanished from Object.keys(payload) and the
// CSV header. buildPayload now uses a null-prototype object, so the invariant
// "payload keys === mapping keys" holds for every key, including __proto__.
//
// (This is the case the discover-and-grow-editions property test — "Property 12: payload has
// exactly mapped fields" — intermittently hit with a specific fast-check seed.)

import { describe, it, expect } from 'vitest';
import { buildPayload, toCsv, parseCsv } from './mapping.js';

// Build a mapping where "__proto__" is a REAL own-enumerable key (an object literal
// `{ __proto__: ... }` would set the prototype instead, so Object.entries wouldn't see it).
// This mirrors how fast-check's fc.dictionary generates the key in the property test.
function mappingWith(entries: Array<[string, string]>): Record<string, string> {
  const m: Record<string, string> = Object.create(null);
  for (const [k, v] of entries) Object.defineProperty(m, k, { value: v, enumerable: true, writable: true, configurable: true });
  return m;
}

describe('buildPayload — prototype-polluting field names', () => {
  it('keeps a "__proto__" destination field as an own key (keys match the mapping exactly)', () => {
    const mapping = mappingWith([['__proto__', 'contactName'], ['email', 'contactEmail']]);
    const lead = { contactName: 'Ada', contactEmail: 'ada@test.com' };
    const payload = buildPayload(lead, mapping);
    expect(new Set(Object.keys(payload))).toEqual(new Set(Object.keys(mapping)));
    expect(payload['__proto__']).toBe('Ada');
    expect(payload['email']).toBe('ada@test.com');
  });

  it('handles other Object.prototype names (constructor, toString) as plain keys', () => {
    const mapping = mappingWith([['constructor', 'a'], ['toString', 'b'], ['hasOwnProperty', 'c']]);
    const lead = { a: '1', b: '2', c: '3' };
    const payload = buildPayload(lead, mapping);
    expect(new Set(Object.keys(payload))).toEqual(new Set(['constructor', 'toString', 'hasOwnProperty']));
    expect(payload['constructor']).toBe('1');
    expect(payload['toString']).toBe('2');
    expect(payload['hasOwnProperty']).toBe('3');
  });

  it('an absent source for a __proto__ field becomes an empty string (not dropped)', () => {
    const mapping = mappingWith([['__proto__', 'missingField']]);
    const payload = buildPayload({}, mapping);
    expect(Object.keys(payload)).toEqual(['__proto__']);
    expect(payload['__proto__']).toBe('');
  });
});

describe('toCsv — prototype-polluting field names', () => {
  it('includes a "__proto__" column in the header and row (round-trips)', () => {
    const mapping = mappingWith([['__proto__', 'contactName'], ['phone', 'contactPhone']]);
    const leads = [{ contactName: 'Ada', contactPhone: '555-0100' }];
    const csv = toCsv(leads, mapping);
    const rows = parseCsv(csv);
    // Header has both columns in mapping order.
    expect(rows[0]).toEqual(['__proto__', 'phone']);
    expect(rows[1]).toEqual(['Ada', '555-0100']);
  });
});
