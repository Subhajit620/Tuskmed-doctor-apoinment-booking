import { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence, motion } from './motion';

const ToastContext = createContext(null);

let idCounter = 0;

const VARIANTS = {
  success: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', path: 'M5 13l4 4L19 7' },
  error: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', iconBg: 'bg-red-100', iconColor: 'text-red-600', path: 'M6 18 18 6M6 6l12 12' },
  info: { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-800', iconBg: 'bg-slate-100', iconColor: 'text-slate-500', path: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0Z' },
};

/** Attractive toast notifications - replaces window.alert(). Wrap a subtree and call useToast(). */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message, variant = 'info', duration = 4500) => {
    const id = ++idCounter;
    setToasts((prev) => [...prev, { id, message, variant }]);
    if (duration) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const api = {
    success: (msg) => push(msg, 'success'),
    error: (msg) => push(msg, 'error'),
    info: (msg) => push(msg, 'info'),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[min(380px,calc(100vw-2rem))] pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => {
            const v = VARIANTS[t.variant] || VARIANTS.info;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -14, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className={`${v.bg} ${v.border} border rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.08)] p-3.5 flex items-start gap-3 pointer-events-auto`}
              >
                <span className={`${v.iconBg} ${v.iconColor} h-7 w-7 rounded-full flex items-center justify-center shrink-0`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d={v.path} />
                  </svg>
                </span>
                <span className={`${v.text} text-sm font-medium leading-snug flex-1 whitespace-pre-line pt-0.5`}>{t.message}</span>
                <button onClick={() => dismiss(t.id)} className={`${v.text} opacity-40 hover:opacity-80 transition-opacity shrink-0 mt-0.5`} aria-label="Dismiss">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
                    <path d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
