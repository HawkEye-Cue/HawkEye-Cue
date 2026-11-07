// @vitest-environment jsdom
//
// Task 3.1 (canva-style-design-integration) — Canva branch + caption-summary note.
// Requirements 2 (fallback/non-regression), 4 (full-caption preservation notice), 9 (responsive strip).
//
// Follows the repo's interactive component-test convention (see hooks/useAiImageConfirm.test.tsx):
// jsdom env + react-dom/client createRoot + act + data-testid queries. No @testing-library needed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ImageSuggestions, { type CanvaCard } from '../ImageSuggestions';
import type { BrandKit } from '../../lib/brandKit';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

// Minimal Brand Kit — the Canva branch never composes templates, so these values are inert here.
const brandKit = { companyName: '', phone: '', logoUrl: '', primaryColor: '' } as unknown as BrandKit;

function noop() {}

type Props = Parameters<typeof ImageSuggestions>[0];

function baseProps(overrides: Partial<Props> = {}): Props {
  return {
    suggestions: [],
    postText: 'Protect what matters most with the right coverage.',
    tradeName: 'Insurance Agent',
    brandKit,
    signature: 'sig-1',
    onOpenStudio: noop,
    onGenerateAiImage: noop,
    onUploadPhoto: noop,
    onNoImage: noop,
    onDismiss: noop,
    canUseAiImage: false,
    ...overrides,
  } as Props;
}

function mount(props: Props) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(createElement(ImageSuggestions, props)); });
}

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const qa = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];
const click = (el: HTMLElement) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

const cardsWithSummary: CanvaCard[] = [
  { id: 'photo', name: 'Photo style', style: 'photo', previewUrl: 'data:image/png;base64,AAA', imageShowsSummary: true },
  { id: 'illustrated', name: 'Illustrated style', style: 'illustrated', previewUrl: 'data:image/png;base64,BBB', imageShowsSummary: false },
  { id: 'editorial', name: 'Editorial style', style: 'editorial', previewUrl: 'data:image/png;base64,CCC', imageShowsSummary: false },
];

const cardsNoSummary: CanvaCard[] = cardsWithSummary.map((c) => ({ ...c, imageShowsSummary: false }));

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { act(() => root.unmount()); });

describe('ImageSuggestions — Canva branch (Req 2, 9)', () => {
  it('renders the Canva cards (data-canva="1") when canvaCards is a non-empty array', () => {
    mount(baseProps({ canvaCards: cardsWithSummary, onOpenCanva: noop }));

    const strip = q('[data-testid="design-suggestions"]');
    expect(strip).not.toBeNull();
    // The Canva branch marks the strip with data-canva="1"; the template path never does.
    expect(strip!.getAttribute('data-canva')).toBe('1');

    // One <li> per supplied Canva card, each showing its name and preview.
    const items = qa('[data-testid="design-suggestions"] > li');
    expect(items.length).toBe(cardsWithSummary.length);
    expect(strip!.textContent).toContain('Photo style');
    expect(strip!.textContent).toContain('Illustrated style');
    expect(strip!.textContent).toContain('Editorial style');
    expect(qa('[data-testid="design-preview"] img').length).toBe(cardsWithSummary.length);
  });

  it('"Use This Design" and "Customize" each call onOpenCanva with that card', () => {
    const onOpenCanva = vi.fn();
    mount(baseProps({ canvaCards: cardsWithSummary, onOpenCanva }));

    const items = qa('[data-testid="design-suggestions"] > li');
    // First card: the two actions are the two <button>s inside the card.
    const firstButtons = Array.from(items[0].querySelectorAll('button')) as HTMLButtonElement[];
    const use = firstButtons.find((b) => b.textContent === 'Use This Design')!;
    const customize = firstButtons.find((b) => b.textContent === 'Customize')!;
    expect(use).toBeTruthy();
    expect(customize).toBeTruthy();

    click(use);
    expect(onOpenCanva).toHaveBeenCalledTimes(1);
    expect(onOpenCanva).toHaveBeenLastCalledWith(cardsWithSummary[0]);

    click(customize);
    expect(onOpenCanva).toHaveBeenCalledTimes(2);
    expect(onOpenCanva).toHaveBeenLastCalledWith(cardsWithSummary[0]);

    // A different card forwards its own card object.
    const lastButtons = Array.from(items[2].querySelectorAll('button')) as HTMLButtonElement[];
    click(lastButtons.find((b) => b.textContent === 'Use This Design')!);
    expect(onOpenCanva).toHaveBeenLastCalledWith(cardsWithSummary[2]);
  });
});

describe('ImageSuggestions — caption-summary note (Req 4)', () => {
  it('shows the caption-summary note when at least one card has imageShowsSummary === true', () => {
    mount(baseProps({ canvaCards: cardsWithSummary, onOpenCanva: noop }));
    expect(q('[data-testid="caption-summary-note"]')).not.toBeNull();
  });

  it('does NOT show the caption-summary note when no card summarizes', () => {
    mount(baseProps({ canvaCards: cardsNoSummary, onOpenCanva: noop }));
    expect(q('[data-testid="design-suggestions"]')!.getAttribute('data-canva')).toBe('1');
    expect(q('[data-testid="caption-summary-note"]')).toBeNull();
  });
});

describe('ImageSuggestions — Canva branch not used when empty (Req 2)', () => {
  it('does not render the Canva strip when canvaCards is null (template path owns the strip)', () => {
    // No template suggestions and no Canva cards → component renders nothing at all.
    mount(baseProps({ canvaCards: null }));
    expect(q('[data-canva="1"]')).toBeNull();
    expect(q('[data-testid="caption-summary-note"]')).toBeNull();
    expect(host.innerHTML).toBe('');
  });

  it('does not render the Canva strip when canvaCards is an empty array', () => {
    mount(baseProps({ canvaCards: [] }));
    expect(q('[data-canva="1"]')).toBeNull();
    expect(q('[data-testid="caption-summary-note"]')).toBeNull();
    expect(host.innerHTML).toBe('');
  });
});
