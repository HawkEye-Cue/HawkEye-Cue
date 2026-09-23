// Field mapping, payload builder, and CSV serialization — pure logic.
// (Requirements 8.1, 8.3, 8.4, 8.5, 8.6, 12.1)

import type { FieldMapping } from '../types/index.js';

/**
 * Returns the required destination fields that are not mapped.
 * A connection may activate only when this is empty.
 * (Requirements 8.3, 8.4)
 */
export function unmappedRequired(mapping: FieldMapping, requiredFields: string[]): string[] {
  return requiredFields.filter((f) => {
    const src = mapping[f];
    return !src || String(src).trim() === '';
  });
}

/** True when all required destination fields have a mapping. */
export function canActivate(mapping: FieldMapping, requiredFields: string[]): boolean {
  return unmappedRequired(mapping, requiredFields).length === 0;
}

/**
 * Build the outbound payload from a lead using ONLY the active mapping.
 * - Transmits only mapped destination fields (never unmapped HawkEye fields).
 * - A mapped field whose source value is absent is transmitted as an empty string.
 * (Requirements 8.5, 8.6)
 */
export function buildPayload(lead: Record<string, any>, mapping: FieldMapping): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [crmField, hawkeyeField] of Object.entries(mapping)) {
    const value = lead[hawkeyeField];
    out[crmField] = value == null ? '' : String(value);
  }
  return out;
}

/** Escape a single CSV cell per RFC 4180. */
function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serialize leads to CSV: one header row + one row per lead.
 * Columns are the mapped destination fields; absent values are empty cells.
 * (Requirement 12.1)
 */
export function toCsv(leads: Record<string, any>[], mapping: FieldMapping): string {
  const columns = Object.keys(mapping);
  const header = columns.map(csvCell).join(',');
  const rows = leads.map((lead) => {
    const payload = buildPayload(lead, mapping);
    return columns.map((c) => csvCell(payload[c] ?? '')).join(',');
  });
  return [header, ...rows].join('\r\n');
}

/**
 * Minimal CSV parser (used by round-trip property test).
 * Splits on CRLF row separators, honoring quoted fields that may contain
 * commas, quotes, and newlines. Every line becomes a row (empty cells kept).
 */
export function parseCsv(csv: string): string[][] {
  if (csv === '') return [];
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\r') {
      if (csv[i + 1] === '\n') i++; // consume the paired \n
      endRow();
    } else if (ch === '\n') {
      endRow();
    } else {
      field += ch;
    }
  }
  // The final line has no trailing separator — always emit it (even if empty,
  // since a preceding separator implies a following row exists).
  endRow();
  return rows;
}
