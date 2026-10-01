import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from '../motion';
import { useAuth } from '../../context/AuthContext';

export default function PatientProfileModal({ open, onClose }) {
  const { activePatient, account, patients, switchActivePatient } = useAuth();
  const navigate = useNavigate();
  const [extraData, setExtraData] = useState({});

  useEffect(() => {
    if (!activePatient?.id) return;
    try {
      const stored = localStorage.getItem(`tuskmed_patient_extra_${activePatient.id}`);
      if (stored) setExtraData(JSON.parse(stored));
    } catch {
      // fallback
    }
  }, [activePatient]);

  if (!open) return null;

  const calculateAge = (dob) => {
    if (!dob) return null;
    const diff = Date.now() - new Date(dob).getTime();
    const ageDate = new Date(diff);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  };

  const age = calculateAge(activePatient?.dob);
  const patientName = activePatient?.name || 'Valued Patient';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
        />

        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          className="relative bg-white rounded-[32px] border border-[#EBE1D5] shadow-2xl max-w-lg w-full p-6 sm:p-8 z-10 overflow-hidden space-y-6"
        >
          {/* Top Banner Background */}
          <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-r from-[#FAF3EC] via-[#FDF9F5] to-[#FAF1E6] border-b border-[#F0E5DA] pointer-events-none" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white text-slate-500 hover:text-slate-800 border border-[#E5D8CA] flex items-center justify-center text-sm font-bold shadow-2xs z-20 transition-all cursor-pointer"
          >
            ✕
          </button>

          {/* Avatar & Main Info */}
          <div className="relative pt-6 flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-3xl bg-gradient-to-tr from-[#CAA067] to-[#B88F55] text-white flex items-center justify-center font-black text-3xl shadow-md border-4 border-white shrink-0">
                {patientName[0]?.toUpperCase() || '👤'}
              </div>
              <div className="space-y-0.5">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#CAA067]/15 text-[#CAA067] text-[10px] font-bold uppercase tracking-wider">
                  Patient Profile
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 font-display">
                  {patientName}
                </h2>
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  <span>{activePatient?.gender || 'Gender not set'}</span>
                  {age !== null && (
                    <>
                      <span>&middot;</span>
                      <span>{age} years old</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Blood Group Badge */}
            <div className="text-center shrink-0">
              <div className="px-3 py-1.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 font-black text-xs font-mono shadow-2xs">
                🩸 {extraData.bloodGroup || 'O+'}
              </div>
            </div>
          </div>

          {/* Key Details Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs pt-1">
            <div className="p-3.5 rounded-2xl bg-[#FAF3EC]/60 border border-[#F0E5DA] space-y-1">
              <div className="text-slate-400 font-medium">Contact Phone</div>
              <div className="font-bold text-slate-800 font-mono">
                {activePatient?.mobile || account?.mobile || 'Not set'}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#FAF3EC]/60 border border-[#F0E5DA] space-y-1">
              <div className="text-slate-400 font-medium">Email Address</div>
              <div className="font-bold text-slate-800 truncate">
                {activePatient?.email || 'Not set'}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#FAF3EC]/60 border border-[#F0E5DA] space-y-1">
              <div className="text-slate-400 font-medium">Location</div>
              <div className="font-bold text-slate-800">
                {activePatient?.city ? `${activePatient.city}, ${activePatient.state || ''}` : 'Location not set'}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#FAF3EC]/60 border border-[#F0E5DA] space-y-1">
              <div className="text-slate-400 font-medium">Emergency Contact</div>
              <div className="font-bold text-slate-800 truncate">
                {extraData.emergencyName ? `${extraData.emergencyName} (${extraData.emergencyPhone || ''})` : 'Not provided'}
              </div>
            </div>
          </div>

          {/* Allergies & Medical History (If any) */}
          {(extraData.allergies || extraData.medicalHistory) && (
            <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-xs space-y-1.5">
              {extraData.allergies && (
                <div>
                  <span className="font-bold text-amber-900">Allergies: </span>
                  <span className="text-amber-800">{extraData.allergies}</span>
                </div>
              )}
              {extraData.medicalHistory && (
                <div>
                  <span className="font-bold text-amber-900">Medical History: </span>
                  <span className="text-amber-800">{extraData.medicalHistory}</span>
                </div>
              )}
            </div>
          )}

          {/* Switch Family Profile Section */}
          {patients && patients.length > 1 && (
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <div className="text-xs font-bold text-slate-700">Switch Family Member</div>
              <div className="flex flex-wrap gap-2">
                {patients.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      switchActivePatient(p.id);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      p.id === activePatient?.id
                        ? 'bg-[#CAA067] text-white shadow-2xs'
                        : 'bg-[#FAF3EC] text-slate-700 hover:bg-[#F2E5D8]'
                    }`}
                  >
                    {p.name} {p.id === activePatient?.id && '✓'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => {
                onClose();
                navigate('/patient/personal-info');
              }}
              className="flex-1 bg-gradient-to-r from-[#CAA067] to-[#B88F55] text-white py-3 px-5 rounded-2xl font-bold text-xs sm:text-sm shadow-xs hover:brightness-105 transition-all text-center cursor-pointer"
            >
              Edit Full Profile
            </button>
            <button
              onClick={() => {
                onClose();
                navigate('/patient/register-patient');
              }}
              className="bg-white border border-[#E5D7CA] text-slate-700 hover:bg-[#FAF3EC] py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm shadow-2xs transition-colors text-center cursor-pointer"
            >
              + Add Family
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
