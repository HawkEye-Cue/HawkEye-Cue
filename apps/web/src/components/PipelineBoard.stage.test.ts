import { describe, it, expect } from 'vitest';
import { stageForLead, STAGES } from './PipelineBoard';
import type { Opportunity } from '@social-lead-gen/shared';

// Minimal Opportunity factory for the pure mapping function under test.
function lead(partial: { id: string; status: string } & Record<string, unknown>): Opportunity {
  return partial as unknown as Opportunity;
}

describe('stageForLead — CRM column mapping (no stored-status change)', () => {
  it('maps status=new to NEW LEADS', () => {
    expect(stageForLead(lead({ id: '1', status: 'new' }), {})).toBe('new');
  });

  it('maps status=converted to CLIENTS', () => {
    expect(stageForLead(lead({ id: '2', status: 'converted' }), {})).toBe('clients');
  });

  it('maps followed_up with no sub-stage to CONTACTED (safe default)', () => {
    expect(stageForLead(lead({ id: '3', status: 'followed_up' }), {})).toBe('contacted');
  });

  it('uses localStorage sub-stage when present', () => {
    expect(stageForLead(lead({ id: '4', status: 'followed_up' }), { '4': 'quoted' })).toBe('quoted');
    expect(stageForLead(lead({ id: '5', status: 'followed_up' }), { '5': 'closing' })).toBe('closing');
  });

  it('prefers server pipelineStage over localStorage (cross-device wins)', () => {
    const l = lead({ id: '6', status: 'followed_up', pipelineStage: 'closing' } as any);
    expect(stageForLead(l, { '6': 'quoted' })).toBe('closing');
  });

  it('never drops a record: every active status resolves to a real column', () => {
    const cols = STAGES.map((s) => s.key);
    for (const status of ['new', 'followed_up', 'converted']) {
      expect(cols).toContain(stageForLead(lead({ id: 'x', status }), {}));
    }
  });

  it('treats an invalid sub-stage as CONTACTED rather than hiding the card', () => {
    expect(stageForLead(lead({ id: '7', status: 'followed_up' }), { '7': 'bogus' as any })).toBe('contacted');
  });

  it('exposes exactly the five required columns in order', () => {
    expect(STAGES.map((s) => s.label)).toEqual(['NEW LEADS', 'CONTACTED', 'QUOTED', 'CLOSING', 'CLIENTS']);
  });
});
