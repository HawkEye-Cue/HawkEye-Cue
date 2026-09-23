// Deduplication decisions — pure logic.
// (Requirements 10.2, 10.3, 10.4, 10.5)

export type PushDecision = 'create' | 'upsert' | 'confirm_duplicate';

export interface DedupLead {
  crmRecordId?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

/**
 * Decide how to push a lead to a destination:
 * - 'upsert'            when a record id is stored AND the destination supports upsert
 * - 'confirm_duplicate' when a record id is stored but the destination does NOT support upsert
 * - 'create'           when no record id is stored
 * (Requirements 10.2, 10.3, 10.4)
 */
export function pushDecision(lead: DedupLead, supportsUpsert: boolean): PushDecision {
  const hasId = lead.crmRecordId != null && String(lead.crmRecordId).trim() !== '';
  if (!hasId) return 'create';
  return supportsUpsert ? 'upsert' : 'confirm_duplicate';
}

function norm(v?: string | null): string {
  return (v ?? '').trim().toLowerCase();
}

/**
 * Find a lead already pushed to the same destination that shares an exact
 * contact email or phone with the candidate. Returns the match or null.
 * (Requirement 10.5)
 */
export function detectDuplicate<T extends DedupLead & { id?: string; sourceAuthor?: string }>(
  candidate: DedupLead,
  alreadyPushed: T[],
): T | null {
  const email = norm(candidate.contactEmail);
  const phone = norm(candidate.contactPhone);
  if (!email && !phone) return null;
  for (const other of alreadyPushed) {
    if (email && norm(other.contactEmail) === email) return other;
    if (phone && norm(other.contactPhone) === phone) return other;
  }
  return null;
}
