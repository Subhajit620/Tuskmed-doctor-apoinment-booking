import { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence, motion } from './motion';

const ConfirmContext = createContext(null);

/**
 * Promise-based confirm modal - replaces window.confirm(). Wrap a subtree
 * and call `const ok = await confirm({ title, message, danger })`.
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);

  const confirm = useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);

  const settle = (result) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {state && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => settle(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[22px] shadow-2xl border border-slate-200 max-w-sm w-full p-6 space-y-5"
            >
              <div className="flex items-start gap-3.5">
                <span
                  className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 ${state.danger ? 'bg-red-100 text-red-600' : ''}`}
                  style={!state.danger ? { backgroundColor: 'var(--brand-100, #F5E4CC)', color: 'var(--brand-700, #B88F55)' } : undefined}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    {state.danger ? (
                      <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                    ) : (
                      <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    )}
                  </svg>
                </span>
                <div className="flex-1 pt-0.5">
                  <h3 className="font-display font-bold text-slate-900 text-lg leading-tight">{state.title}</h3>
                  {state.message && (
                    <p className="text-sm text-slate-600 mt-1.5 whitespace-pre-line leading-relaxed">{state.message}</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => settle(false)}>{state.cancelLabel || 'Cancel'}</button>
                <button
                  className={state.danger ? 'btn bg-red-600 text-white shadow-card hover:bg-red-700 active:bg-red-800' : 'btn-primary'}
                  onClick={() => settle(true)}
                  autoFocus
                >
                  {state.confirmLabel || 'Confirm'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}
