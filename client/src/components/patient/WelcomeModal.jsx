import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from '../motion';
import { useAuth } from '../../context/AuthContext';

export default function WelcomeModal({ forceOpen = false, onClose }) {
  const { activePatient, account } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      return;
    }
    // Check if user has already seen welcome popup in this session
    const seen = sessionStorage.getItem('tuskmed_welcome_seen');
    if (!seen) {
      const timer = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(timer);
    }
  }, [forceOpen]);

  const handleDismiss = () => {
    sessionStorage.setItem('tuskmed_welcome_seen', 'true');
    setOpen(false);
    if (onClose) onClose();
  };

  const handleGoProfile = () => {
    handleDismiss();
    navigate('/patient/personal-info');
  };

  const patientName = activePatient?.name || (account?.mobile ? `Patient (${account.mobile.slice(-4)})` : 'Valued Patient');

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleDismiss}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 15 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="relative bg-gradient-to-b from-[#FFFDF9] to-[#FAF4EC] rounded-[32px] border border-[#EBE1D5] shadow-2xl max-w-lg w-full p-6 sm:p-8 z-10 overflow-hidden space-y-6"
          >
            {/* Ambient Background Glows */}
            <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-[#CAA067]/15 blur-2xl pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-[#1B365D]/10 blur-2xl pointer-events-none" />

            {/* Close Button */}
            <button
              onClick={handleDismiss}
              className="absolute top-5 right-5 h-8 w-8 rounded-full bg-white/80 hover:bg-white text-slate-500 hover:text-slate-800 border border-[#E5D8CA] flex items-center justify-center text-sm font-bold shadow-2xs transition-all z-20 cursor-pointer"
            >
              ✕
            </button>

            {/* Header / Avatar */}
            <div className="flex items-center gap-4 relative z-10">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-[#CAA067] to-[#B88F55] text-white flex items-center justify-center font-black text-2xl shadow-md shrink-0 ring-4 ring-white">
                {patientName[0]?.toUpperCase() || '👤'}
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#CAA067]/15 text-[#CAA067] border border-[#CAA067]/30 text-[11px] font-bold uppercase tracking-wide">
                  <span>✨</span> Welcome to TuskMed
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-[#1B365D] font-display mt-0.5">
                  Hello, {patientName}!
                </h2>
              </div>
            </div>

            {/* Welcome Description */}
            <p className="text-sm text-slate-600 leading-relaxed relative z-10">
              Your personalized digital healthcare portal is active. Here is how you can get the most out of your consultation experience:
            </p>

            {/* 3 Quick Features */}
            <div className="space-y-3 relative z-10">
              <div className="p-3.5 rounded-2xl bg-white/90 border border-[#EFE5DA] shadow-2xs flex items-center gap-3.5">
                <div className="h-10 w-10 rounded-xl bg-[#FAF3EC] text-[#CAA067] flex items-center justify-center text-lg shrink-0">
                  🎥
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Instant Video Consultations</div>
                  <div className="text-[11px] text-slate-500">Connect face-to-face with verified specialists directly from your browser.</div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white/90 border border-[#EFE5DA] shadow-2xs flex items-center gap-3.5">
                <div className="h-10 w-10 rounded-xl bg-[#FAF3EC] text-emerald-600 flex items-center justify-center text-lg shrink-0">
                  📊
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Live Health & Vitals Tracking</div>
                  <div className="text-[11px] text-slate-500">Record BP, Pulse, SpO2, and Blood Sugar with real-time normal indicators.</div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white/90 border border-[#EFE5DA] shadow-2xs flex items-center gap-3.5">
                <div className="h-10 w-10 rounded-xl bg-[#FAF3EC] text-blue-600 flex items-center justify-center text-lg shrink-0">
                  💊
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Digital Prescriptions & Vault</div>
                  <div className="text-[11px] text-slate-500">Download printable doctor prescriptions and access uploaded medical reports anytime.</div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3 relative z-10">
              <button
                onClick={handleGoProfile}
                className="w-full sm:flex-1 bg-gradient-to-r from-[#CAA067] to-[#B88F55] text-white py-3 px-5 rounded-2xl font-bold text-sm shadow-xs hover:brightness-105 transition-all text-center cursor-pointer"
              >
                Complete Patient Profile
              </button>
              <button
                onClick={handleDismiss}
                className="w-full sm:w-auto bg-white border border-[#E5D7CA] text-slate-700 hover:bg-[#FAF3EC] py-3 px-5 rounded-2xl font-bold text-sm shadow-2xs transition-colors text-center cursor-pointer"
              >
                Explore Dashboard
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
