// @vitest-environment jsdom
//
// Focused tests for The Hawk's Perch leaderboard: ranks strictly by Net New Business
// Premium written, highest first; shows a NEUTRAL tied state rather than inventing a
// winner; never uses leads/pipeline for ranking (it only receives wonValue/wonDeals).

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import HawkPerch, { type HawkPerchMember } from './HawkPerch';

function render(members: HawkPerchMember[], teamTotal: number) {
  return renderToStaticMarkup(
    createElement(HawkPerch, {
      members,
      colorClassFor: () => 'bg-amber-500',
      displayNameFor: (email: string) => email.split('@')[0],
      periodLabel: 'Current Folio',
      teamTotal,
    }),
  );
}

describe("The Hawk's Perch — premium-based ranking", () => {
  it('orders employees by premium written, highest first', () => {
    const html = render([
      { userId: '1', email: 'low@a.com', wonValue: 1000, wonDeals: 1 },
      { userId: '2', email: 'high@a.com', wonValue: 9000, wonDeals: 3 },
      { userId: '3', email: 'mid@a.com', wonValue: 5000, wonDeals: 2 },
    ], 15000);
    const order = ['high', 'mid', 'low'].map((n) => html.indexOf(n));
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  });

  it('marks the sole highest producer as Top Hawk', () => {
    const html = render([
      { userId: '1', email: 'a@a.com', wonValue: 9000, wonDeals: 3 },
      { userId: '2', email: 'b@a.com', wonValue: 1000, wonDeals: 1 },
    ], 10000);
    expect(html).toContain('Top Hawk');
  });

  it('shows a NEUTRAL tied state (no Top Hawk) when the leaders are tied', () => {
    const html = render([
      { userId: '1', email: 'a@a.com', wonValue: 5000, wonDeals: 2 },
      { userId: '2', email: 'b@a.com', wonValue: 5000, wonDeals: 2 },
    ], 10000);
    expect(html).not.toContain('Top Hawk'); // no invented winner
    expect(html).toContain('T1'); // neutral tied rank label
  });

  it('shows contribution % of team premium (not leads/pipeline)', () => {
    const html = render([
      { userId: '1', email: 'a@a.com', wonValue: 7500, wonDeals: 3 },
      { userId: '2', email: 'b@a.com', wonValue: 2500, wonDeals: 1 },
    ], 10000);
    expect(html).toContain('75% of team');
  });

  it('renders the period label and premium figures', () => {
    const html = render([{ userId: '1', email: 'a@a.com', wonValue: 4200, wonDeals: 2 }], 4200);
    expect(html).toContain('Current Folio');
    expect(html).toContain('$4,200');
    expect(html).toContain('2 completed sales');
  });

  it('handles an empty roster without crashing', () => {
    const html = render([], 0);
    expect(html).toContain('No team members yet');
  });
});
