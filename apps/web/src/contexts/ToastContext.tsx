import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

interface ToastState {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastState | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setVisible(true);
    setTimeout(() => setVisible(false), 1500);
    setTimeout(() => setToast(null), 2000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-full bg-green-600/90 text-white text-sm font-medium shadow-lg shadow-green-900/30 backdrop-blur-sm transition-all duration-300 pointer-events-none ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          {toast}
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
