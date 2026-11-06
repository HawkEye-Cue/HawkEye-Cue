/**
 * useAiImageConfirm — the single gate in front of every paid AI image request.
 *
 *   const { confirmAiImage, confirmDialog } = useAiImageConfirm(getClient);
 *   if (!(await confirmAiImage('generate'))) return;   // cancelled → no request was made
 *
 * The promise resolves true ONLY when the user presses Generate with a loaded balance that
 * covers the cost. A second call while a dialog is open is rejected (resolves false), so a
 * double click can never queue two paid requests.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { ApiClient } from '@social-lead-gen/shared';
import AiImageConfirmDialog, { type AiImageKind } from '../components/AiImageConfirmDialog';
import { canAfford, fetchImageCredits, type ImageCredits } from '../lib/aiImageCredits';

export function useAiImageConfirm(getClient: () => Promise<Pick<ApiClient, 'request'>>): {
  confirmAiImage: (kind: AiImageKind) => Promise<boolean>;
  confirmDialog: ReactNode;
} {
  const [open, setOpen] = useState<AiImageKind | null>(null);
  const [credits, setCredits] = useState<ImageCredits | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const creditsRef = useRef<ImageCredits | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null); setCredits(null); creditsRef.current = null;
    try {
      const c = await fetchImageCredits(await getClient());
      setCredits(c); creditsRef.current = c;
    } catch {
      setError('We couldn’t load your AI image balance.');
    } finally { setLoading(false); }
  }, [getClient]);

  const finish = useCallback((ok: boolean) => {
    const r = resolver.current;
    resolver.current = null;
    setOpen(null);
    r?.(ok);
  }, []);

  const confirmAiImage = useCallback((kind: AiImageKind) => {
    if (resolver.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOpen(kind);
      void load();
    });
  }, [load]);

  const confirmDialog = open ? (
    <AiImageConfirmDialog
      kind={open}
      credits={credits}
      loading={loading}
      error={error}
      onRetry={() => void load()}
      onCancel={() => finish(false)}
      onConfirm={() => { if (canAfford(creditsRef.current)) finish(true); }}
    />
  ) : null;

  return { confirmAiImage, confirmDialog };
}
