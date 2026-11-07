// @vitest-environment jsdom
//
// Task 6.1 (canva-style-design-integration) — Setup Guide overlap fix (verify).
// Requirement 9: WHILE on the `/create` route, THE Setup Guide SHALL start collapsed and remain
// accessible without obstructing the user's work.
//
// This test asserts the behavior WITHOUT modifying product code. It pins the collapsed-by-default
// decision keyed on `location.pathname.startsWith('/create')` (SetupWizard.tsx), that the panel
// expands via the accessible toggle and collapses again (non-destructive), and that non-/create
// routes are NOT forced collapsed (no regression).
//
// Follows the repo's interactive component-test convention (see ImageSuggestions.canva.test.tsx):
// jsdom env + react-dom/client createRoot + act + DOM queries. @testing-library/react is NOT
// installed, so we drive the component directly.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// --- Isolate SetupWizard from its heavy dependencies ---------------------------------------
// The router + the three contexts (Trade/Auth/Edition) pull in aws-amplify and the API client,
// which cannot run in jsdom. We stub only what SetupWizard consumes.

// Mutable location so each mount can simulate a different route.
const mockLocation = { pathname: '/create' };
const navigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useLocation: () => mockLocation,
}));

vi.mock('../../contexts/TradeContext', () => ({
  // No trade selected keeps the first step incomplete so the expanded panel renders step content.
  useTrade: () => ({ selectedTrade: null, selectedTrades: [] }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { sub: 'user-123', email: 'u@example.com' } }),
}));

vi.mock('../../contexts/EditionContext', () => ({
  useEdition: () => ({ isDiscover: false, isGrow: true }),
}));

// Import AFTER the mocks are registered.
import SetupWizard from '../SetupWizard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(createElement(SetupWizard, { onComplete: vi.fn() })); });
}

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const click = (el: HTMLElement) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

// Collapsed state = ONLY the small round toggle (title="Setup Guide") is rendered; the expanded
// body ("Skip this step" action, progress bar, step action) is absent.
const collapseToggle = () => q('button[title="Setup Guide"]');
const expandedBody = () => {
  // The expanded panel uniquely contains the "Skip this step" control and the header label span.
  const skip = Array.from(document.querySelectorAll('button')).find(
    (b) => (b.textContent || '').includes('Skip this step'),
  ) as HTMLElement | undefined;
  return skip ?? null;
};
const isCollapsed = () => collapseToggle() !== null && expandedBody() === null;
const isExpanded = () => expandedBody() !== null;

beforeEach(() => {
  document.body.innerHTML = '';
  navigate.mockClear();
  mockLocation.pathname = '/create';
  localStorage.clear();
});
afterEach(() => { act(() => root.unmount()); });

describe('SetupWizard — collapsed on /create (Req 9.3, 9.4)', () => {
  it('starts COLLAPSED on the /create route (only the accessible toggle is shown)', () => {
    mockLocation.pathname = '/create';
    mount();

    // Collapsed: just the small round pill toggle, no obstructing panel body.
    const toggle = collapseToggle();
    expect(toggle).not.toBeNull();
    // Accessible: the toggle carries a title and is a real <button> (keyboard/AT reachable).
    expect(toggle!.tagName).toBe('BUTTON');
    expect(toggle!.getAttribute('title')).toBe('Setup Guide');
    expect(isCollapsed()).toBe(true);
    expect(isExpanded()).toBe(false);
  });

  it('also starts collapsed on a nested create route (e.g. /create/anything)', () => {
    mockLocation.pathname = '/create/new';
    mount();
    expect(isCollapsed()).toBe(true);
  });

  it('expands when the toggle is clicked, then collapses again — accessible + non-destructive', () => {
    mockLocation.pathname = '/create';
    mount();

    // Expand via the accessible toggle.
    click(collapseToggle()!);
    expect(isExpanded()).toBe(true);
    // The expanded panel shows a step action and a progress indicator, not an obstruction-only pill.
    expect(collapseToggle()).toBeNull();

    // Collapse again via the "−" minimize control in the expanded header.
    const minimize = Array.from(document.querySelectorAll('button')).find(
      (b) => (b.textContent || '').trim() === '−',
    ) as HTMLElement | undefined;
    expect(minimize).toBeTruthy();
    click(minimize!);

    // Back to collapsed; nothing destructive happened (toggle present again, body gone).
    expect(isCollapsed()).toBe(true);
  });
});

describe('SetupWizard — non-/create routes behave as before (no regression) (Req 9)', () => {
  it('does NOT start collapsed on a non-/create route', () => {
    mockLocation.pathname = '/dashboard';
    mount();
    expect(isExpanded()).toBe(true);
    expect(collapseToggle()).toBeNull();
  });

  it('does NOT treat a route that merely contains "create" later in the path as /create', () => {
    // startsWith('/create') is the exact predicate — '/x/create' must NOT force collapse.
    mockLocation.pathname = '/x/create';
    mount();
    expect(isExpanded()).toBe(true);
  });
});
