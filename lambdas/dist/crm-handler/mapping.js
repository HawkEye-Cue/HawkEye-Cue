'use strict';
// Field mapping, payload builder, and CSV — mirror of packages/shared/src/crm/mapping.ts

function unmappedRequired(mapping, requiredFields) {
  return (requiredFields || []).filter((f) => {
    const src = mapping[f];
    return !src || String(src).trim() === '';
  });
}

function canActivate(mapping, requiredFields) {
  return unmappedRequired(mapping, requiredFields).length === 0;
}

function buildPayload(lead, mapping) {
  const out = {};
  for (const [crmField, hawkeyeField] of Object.entries(mapping || {})) {
    const value = lead[hawkeyeField];
    out[crmField] = value == null ? '' : String(value);
  }
  return out;
}

function csvCell(value) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function toCsv(leads, mapping) {
  const columns = Object.keys(mapping || {});
  const header = columns.map(csvCell).join(',');
  const rows = (leads || []).map((lead) => {
    const payload = buildPayload(lead, mapping);
    return columns.map((c) => csvCell(payload[c] == null ? '' : payload[c])).join(',');
  });
  return [header, ...rows].join('\r\n');
}

module.exports = { unmappedRequired, canActivate, buildPayload, toCsv };
