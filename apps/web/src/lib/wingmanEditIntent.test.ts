// Tests for the Wingman edit-intent router.
//
// The router is the cost/quality gate for "Ask Wingman to Edit": a misroute either WASTES
// money (a free canvas edit sent to the paid AI model) or FAILS the user (a real photo edit
// attempted on the canvas). Every example phrase from the product spec is covered.

import { describe, it, expect } from 'vitest';
import { classifyEditIntent } from './wingmanEditIntent';

const route = (s: string) => classifyEditIntent(s).route;
const actions = (s: string) => {
  const r = classifyEditIntent(s);
  return r.route === 'canvas' ? r.actions : [];
};

describe('canvas edits — instant, free, keep layers editable (spec examples)', () => {
  it('"Make the headline bigger" → canvas resize of the headline', () => {
    expect(route('Make the headline bigger')).toBe('canvas');
    expect(actions('Make the headline bigger')).toEqual([{ kind: 'resizeText', target: 'headline', factor: 1.2 }]);
  });

  it('"Change the background to black" → canvas background fill (NOT a photo edit)', () => {
    expect(route('Change the background to black')).toBe('canvas');
    expect(actions('Change the background to black')).toEqual([{ kind: 'setBackground', color: '#000000' }]);
  });

  it('"Add my logo" → canvas logo layer (exact asset, never AI-painted)', () => {
    expect(route('Add my logo')).toBe('canvas');
    expect(actions('Add my logo')).toEqual([{ kind: 'addLogo' }]);
  });

  it('"Add my company logo to the bottom-right corner" → canvas logo (not a photo edit)', () => {
    expect(route('Add my company logo to the bottom-right corner')).toBe('canvas');
    expect(actions('Add my company logo to the bottom-right corner').map((a) => a.kind)).toContain('addLogo');
  });

  it('"Move the phone number to the bottom" → canvas move', () => {
    expect(route('Move the phone number to the bottom')).toBe('canvas');
    expect(actions('Move the phone number to the bottom')).toEqual([{ kind: 'moveText', target: 'phone', to: 'bottom' }]);
  });

  it('makes text smaller', () => {
    expect(actions('make the text smaller')).toEqual([{ kind: 'resizeText', target: 'all', factor: 0.83 }]);
  });

  it('recolors the headline', () => {
    expect(actions('make the headline orange')).toEqual([{ kind: 'setTextColor', target: 'headline', color: '#f97316' }]);
  });

  it('accepts hex colors', () => {
    expect(actions('change the background to #1e3a5f')).toEqual([{ kind: 'setBackground', color: '#1e3a5f' }]);
  });

  it('"apply my brand" → canvas brand fill', () => {
    expect(actions('apply my brand').map((a) => a.kind)).toContain('applyBrand');
  });

  it('combines multiple canvas edits in one request', () => {
    const a = actions('make the headline bigger and change the background to navy');
    expect(a.map((x) => x.kind).sort()).toEqual(['resizeText', 'setBackground']);
  });
});

describe('photo edits — routed to the AI image editor (spec examples)', () => {
  const photoCases = [
    'Remove the trash cans from this driveway',
    'Remove the person standing in the background',
    'Remove the background behind me',
    'Brighten the sky but keep the house the same',
    'remove the car',
    'replace the old fence with a white picket fence',
    'get rid of the wires',
    'erase the shadow on the roof',
  ];
  for (const c of photoCases) {
    it(`"${c}" → photo`, () => {
      const r = classifyEditIntent(c);
      expect(r.route).toBe('photo');
      // The ORIGINAL wording is passed through to the model unchanged.
      if (r.route === 'photo') expect(r.instruction).toBe(c);
    });
  }
});

describe('the critical background distinction', () => {
  it('"change the background to black" is a free canvas fill', () => {
    expect(route('change the background to black')).toBe('canvas');
  });
  it('"remove the background" is a paid photo edit', () => {
    expect(route('remove the background')).toBe('photo');
  });
  it('"blur the background" is a photo edit', () => {
    expect(route('blur the background')).toBe('photo');
  });
});

describe('unknown — never silently spend AI credits on a guess', () => {
  it('"Make this look more professional" → unknown (asks user to be specific)', () => {
    expect(route('Make this look more professional')).toBe('unknown');
  });
  it('empty input → unknown', () => {
    expect(route('')).toBe('unknown');
    expect(route('   ')).toBe('unknown');
  });
  it('gibberish → unknown', () => {
    expect(route('asdf qwerty')).toBe('unknown');
  });
});

describe('cost safety — canvas edits never route to the paid photo model', () => {
  const canvasOnly = [
    'Make the headline bigger',
    'Change the background to black',
    'Add my logo',
    'Move the phone number to the bottom',
    'make the text smaller',
  ];
  for (const c of canvasOnly) {
    it(`"${c}" does not route to photo`, () => {
      expect(route(c)).not.toBe('photo');
    });
  }
});
