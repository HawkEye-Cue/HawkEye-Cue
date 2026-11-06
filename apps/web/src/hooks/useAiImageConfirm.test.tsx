// @vitest-environment jsdom
//
// The paid-AI-image confirmation: exact cost + real remaining balance, explicit Generate,
// Cancel never proceeds, and the gate can't be bypassed by double clicks or a failed balance.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAiImageConfirm } from './useAiImageConfirm';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Confirm = (k: 'generate' | 'edit') => Promise<boolean>;
let root: Root; let host: HTMLDivElement; let confirmFn: Confirm;

function mount(request: (m: string, p: string) => Promise<unknown>) {
  const getClient = async () => ({ request }) as never;
  function Harness() {
    const { confirmAiImage, confirmDialog } = useAiImageConfirm(getClient);
    useEffect(() => { confirmFn = confirmAiImage; });
    return confirmDialog;
  }
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(createElement(Harness)); });
}
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = (id: string) => act(() => { q(id)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { act(() => root.unmount()); });

const BAL = { tier: 'soar', costPerImage: 1, limit: 40, used: 9, remaining: 31, month: '2026-11' };

describe('AI image confirmation', () => {
  it('shows the exact cost and the REAL remaining balance from the server', async () => {
    const request = vi.fn(async () => BAL);
    mount(request);
    let p!: Promise<boolean>;
    act(() => { p = confirmFn('generate'); });
    await flush();
    expect(request).toHaveBeenCalledWith('GET', '/content/image-credits');
    expect(q('ai-confirm-cost')!.textContent).toBe('1 AI image credit');
    expect(q('ai-confirm-remaining')!.textContent).toBe('31 of 40');
    expect((q('ai-confirm-generate') as HTMLButtonElement).disabled).toBe(false);
    click('ai-confirm-cancel');
    await expect(p).resolves.toBe(false);
    expect(q('ai-confirm')).toBeNull();
  });

  it('Generate resolves true only after the explicit click', async () => {
    mount(async () => BAL);
    let p!: Promise<boolean>; let settled = false;
    act(() => { p = confirmFn('edit'); p.then(() => { settled = true; }); });
    await flush();
    expect(settled).toBe(false); // waiting on the user
    click('ai-confirm-generate');
    await expect(p).resolves.toBe(true);
  });

  it('Escape cancels', async () => {
    mount(async () => BAL);
    let p!: Promise<boolean>;
    act(() => { p = confirmFn('generate'); });
    await flush();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await expect(p).resolves.toBe(false);
  });

  it('with 0 credits left, Generate is disabled and cannot proceed', async () => {
    mount(async () => ({ ...BAL, used: 40, remaining: 0 }));
    let p!: Promise<boolean>; let settled = false;
    act(() => { p = confirmFn('generate'); p.then(() => { settled = true; }); });
    await flush();
    expect((q('ai-confirm-generate') as HTMLButtonElement).disabled).toBe(true);
    expect(q('ai-confirm-insufficient')).not.toBeNull();
    click('ai-confirm-generate');
    await flush();
    expect(settled).toBe(false);
    click('ai-confirm-cancel');
    await expect(p).resolves.toBe(false);
  });

  it('if the balance cannot be loaded, Generate stays disabled (no guessing) and Retry works', async () => {
    let fail = true;
    mount(async () => { if (fail) throw new Error('503'); return BAL; });
    let p!: Promise<boolean>;
    act(() => { p = confirmFn('generate'); });
    await flush();
    expect((q('ai-confirm-generate') as HTMLButtonElement).disabled).toBe(true);
    expect(q('ai-confirm-remaining')!.textContent).toBe('—');
    fail = false;
    act(() => { (document.querySelector('[role="alert"] button') as HTMLElement).click(); });
    await flush();
    expect(q('ai-confirm-remaining')!.textContent).toBe('31 of 40');
    click('ai-confirm-generate');
    await expect(p).resolves.toBe(true);
  });

  it('a second request while the dialog is open is refused (no double paid request)', async () => {
    mount(async () => BAL);
    let first!: Promise<boolean>; let second!: Promise<boolean>;
    act(() => { first = confirmFn('generate'); second = confirmFn('generate'); });
    await expect(second).resolves.toBe(false);
    await flush();
    click('ai-confirm-generate');
    await expect(first).resolves.toBe(true);
  });

  it('rejects a malformed balance response instead of showing a made-up number', async () => {
    mount(async () => ({ remaining: 'lots' }));
    act(() => { void confirmFn('generate'); });
    await flush();
    expect((q('ai-confirm-generate') as HTMLButtonElement).disabled).toBe(true);
    expect(q('ai-confirm-remaining')!.textContent).toBe('—');
  });
});
