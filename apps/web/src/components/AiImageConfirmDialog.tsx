/**
 * Confirmation shown before EVERY paid AI image request. Shows the exact credit cost and the
 * user's actual remaining balance (read from the server). Nothing is sent until "Generate" is
 * pressed; Cancel, Escape, or clicking outside resolve as cancelled with no request at all.
 *
 * Generate stays disabled until the real balance has loaded, and when the balance cannot cover
 * the cost — we never guess a balance.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { canAfford, type ImageCredits } from '../lib/aiImageCredits';

export type AiImageKind = 'generate' | 'edit';

interface Props {
  kind: AiImageKind;
  credits: ImageCredits | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function AiImageConfirmDialog({ kind, credits, loading, error, onRetry, onConfirm, onCancel }: Props): ReactNode {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const afford = canAfford(credits);
  const cost = credits?.costPerImage ?? 1;
  const unit = (n: number) => `${n} AI image credit${n === 1 ? '' : 's'}`;
  const title = kind === 'edit' ? 'Edit this photo with AI?' : 'Generate an AI image?';

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      data-testid="ai-confirm"
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="ai-confirm-title" aria-describedby="ai-confirm-desc"
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-5 text-white shadow-2xl space-y-4">
        <div>
          <h2 id="ai-confirm-title" className="text-base font-bold">{title}</h2>
          <p id="ai-confirm-desc" className="text-xs text-slate-400 mt-1">
            This is a paid AI image. The free designs and photo uploads never use credits.
          </p>
        </div>

        <dl className="rounded-xl bg-white/5 border border-white/10 divide-y divide-white/10 text-sm">
          <div className="flex justify-between px-3 py-2">
            <dt className="text-slate-300">Cost</dt>
            <dd className="font-bold" data-testid="ai-confirm-cost">{unit(cost)}</dd>
          </div>
          <div className="flex justify-between px-3 py-2">
            <dt className="text-slate-300">Remaining this month</dt>
            <dd className="font-bold" data-testid="ai-confirm-remaining" aria-live="polite">
              {loading ? 'Loading…' : credits ? `${credits.remaining} of ${credits.limit}` : '—'}
            </dd>
          </div>
          {credits && afford && (
            <div className="flex justify-between px-3 py-2">
              <dt className="text-slate-300">After this image</dt>
              <dd className="font-bold">{credits.remaining - cost}</dd>
            </div>
          )}
        </dl>

        {error && (
          <p className="text-xs text-red-300" role="alert">
            {error} <button onClick={onRetry} className="underline font-semibold">Try again</button>
          </p>
        )}
        {credits && !afford && (
          <p className="text-xs text-amber-300" role="alert" data-testid="ai-confirm-insufficient">
            You don’t have enough AI image credits left this month. Your free designs are still unlimited.
          </p>
        )}

        <div className="flex gap-2">
          <button ref={cancelRef} onClick={onCancel} data-testid="ai-confirm-cancel"
            className="flex-1 py-2.5 rounded-lg bg-white/5 border border-white/15 text-sm font-semibold hover:bg-white/10">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading || !afford} data-testid="ai-confirm-generate"
            className="flex-1 py-2.5 rounded-lg bg-amber-500 text-black text-sm font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
            {kind === 'edit' ? `Edit · ${unit(cost)}` : `Generate · ${unit(cost)}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
