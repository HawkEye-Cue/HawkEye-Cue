// Account data export builder — pure logic.
// Includes edition, masked CRM connections, and per-lead push status.
// Never includes plaintext or ciphertext credentials.
// (Requirements 15.3, 15.4)

import type { Edition, PushStatus } from '../types/index.js';
import { sanitizeConnectionForRead } from './crypto.js';

export interface ExportAccount {
  edition: Edition;
  connections: Array<Record<string, any>>; // raw stored connection items (may hold credentialCiphertext)
  leads: Array<Record<string, any>>;
}

export interface ExportedConnection {
  connectionId?: string;
  destinationType?: string;
  connectionMethod?: string;
  availability?: string;
  fieldMapping?: Record<string, string>;
  active?: boolean;
  credentialMasked: string;
  createdAt?: string;
}

export interface ExportDoc {
  edition: Edition;
  crmConnections: ExportedConnection[];
  leadPushStatus: Array<{ id: string; pushStatus: PushStatus }>;
}

/**
 * Build the export document. Strips credentials to a masked marker.
 * (Requirements 15.3, 15.4)
 */
export function buildExport(account: ExportAccount): ExportDoc {
  const crmConnections = account.connections.map((c) => {
    const sanitized = sanitizeConnectionForRead(c) as any;
    // Ensure no ciphertext survives even if the caller shaped the object oddly.
    delete sanitized.credentialCiphertext;
    return sanitized as ExportedConnection;
  });

  const leadPushStatus = account.leads.map((l) => ({
    id: String(l.id ?? l.opportunityId ?? ''),
    pushStatus: (l.pushStatus ?? 'not_pushed') as PushStatus,
  }));

  return { edition: account.edition, crmConnections, leadPushStatus };
}
