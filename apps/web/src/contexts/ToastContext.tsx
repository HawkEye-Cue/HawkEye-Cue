import { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';

interface ToastState {
  showToast: (message: string) => void;
  /** Show a toast with an Undo button. onUndo fires if the user taps Undo before it disappears. */
  showUndoToast: (message: string, onUndo: () => void, durationMs?: number) => void;
}

const ToastContext = createContext<ToastState | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [undoFn, setUndoFn] = useState<(() => void) | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimeout2 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    if (clearTimeout2.current) clearTimeout(clearTimeout2.current);
  };

  const showToast = useCallback((message: string) => {
    clearTimers();
    setUndoFn(null);
    setToast(message);
    setVisible(true);
    hideTimeout.current = setTimeout(() => setVisible(false), 1500);
    clearTimeout2.current = setTimeout(() => setToast(null), 2000);
  }, []);

  const showUndoToast = useCallback((message: string, onUndo: () => void, durationMs = 5000) => {
    clearTimers();
    setUndoFn(() => onUndo);
    setToast(message);
    setVisible(true);
    hideTimeout.current = setTimeout(() => setVisible(false), durationMs);
    clearTimeout2.current = setTimeout(() => { setToast(null); setUndoFn(null); }, durationMs + 500);
  }, []);

  const handleUndo = () => {
    if (undoFn) undoFn();
    clearTimers();
    setVisible(false);
    setTimeout(() => { setToast(null); setUndoFn(null); }, 300);
  };

  return (
    <ToastContext.Provider value={{ showToast, showUndoToast }}>
      {children}
      {toast && (
        <div
          className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-full bg-slate-800/95 text-white text-sm font-medium shadow-lg shadow-black/30 backdrop-blur-sm transition-all duration-300 flex items-center gap-3 ${
            undoFn ? '' : 'pointer-events-none bg-green-600/90'
          } ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
        >
          <span>{toast}</span>
          {undoFn && (
            <button
              onClick={handleUndo}
              className="text-blue-300 hover:text-blue-200 font-bold text-xs underline underline-offset-2"
            >
              Undo
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
