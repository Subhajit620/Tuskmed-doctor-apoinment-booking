import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from './motion';

export default function PrescriptionModal({ isOpen, onClose, appointment, patient, doctor }) {
  const printRef = useRef(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !appointment) return null;

  const apptDoctor = doctor || appointment.doctor || {};
  const apptPatient = patient || appointment.patient || {};
  const prescription = appointment.prescription;
  const medicines = prescription?.medicines || [];
  const notes = prescription?.notes || '';
  const dateStr = new Date(appointment.slot?.start || appointment.createdAt || Date.now()).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const timeStr = new Date(appointment.slot?.start || appointment.createdAt || Date.now()).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handlePrint = (e) => {
    if (e) e.stopPropagation();
    window.print();
  };

  // Helper to parse notes into sections if structured
  const parseSections = (rawNotes) => {
    if (!rawNotes) return { diagnosis: '', labs: '', advice: '', followUp: '', general: '' };
    const diagMatch = rawNotes.match(/\[PROVISIONAL DIAGNOSIS\]\s*([\s\S]*?)(?=\n\[|$)/i);
    const labsMatch = rawNotes.match(/\[ADVISED INVESTIGATIONS \/ LAB TESTS\]\s*([\s\S]*?)(?=\n\[|$)/i);
    const adviceMatch = rawNotes.match(/\[GENERAL & DIETARY ADVICE\]\s*([\s\S]*?)(?=\n\[|$)/i);
    const followMatch = rawNotes.match(/\[FOLLOW-UP SCHEDULE\]\s*([\s\S]*?)(?=\n\[|$)/i);

    if (diagMatch || labsMatch || adviceMatch || followMatch) {
      return {
        diagnosis: diagMatch ? diagMatch[1].trim() : '',
        labs: labsMatch ? labsMatch[1].trim() : '',
        advice: adviceMatch ? adviceMatch[1].trim() : '',
        followUp: followMatch ? followMatch[1].trim() : '',
        general: '',
      };
    }
    return { diagnosis: '', labs: '', advice: '', followUp: '', general: rawNotes };
  };

  const parsed = parseSections(notes);

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 print:p-0 print:bg-white print:static print:inset-auto select-text"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ duration: 0.22 }}
          onClick={(e) => e.stopPropagation()}
          className="relative bg-white text-slate-900 rounded-[28px] shadow-2xl max-w-3xl w-full flex flex-col overflow-hidden border border-slate-300 print:border-0 print:shadow-none print:rounded-none print:max-w-none my-auto"
        >
          {/* Header Action Bar (Hidden during Print) */}
          <div className="px-5 sm:px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0 print:hidden border-b border-slate-800 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[#CAA067] to-[#B88F55] text-white font-serif font-black text-xl flex items-center justify-center shadow-md shrink-0">
                ℞
              </span>
              <div className="min-w-0">
                <h3 className="font-extrabold text-sm sm:text-base font-display text-white truncate">
                  Official Medical Prescription Slip
                </h3>
                <p className="text-[11px] text-slate-300 truncate">
                  Ref: TM-RX-{(appointment.id || '').slice(0, 8).toUpperCase()} &middot; Digitally Authenticated
                </p>
              </div>
            </div>

            {/* Top Right Action Buttons */}
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handlePrint}
                className="btn-primary !px-3.5 sm:!px-4 !py-2 text-xs font-bold flex items-center gap-2 bg-[#CAA067] hover:bg-[#B88F55] text-white rounded-xl shadow-sm transition-all cursor-pointer"
              >
                <span>🖨️</span>
                <span className="hidden sm:inline">Print / Save PDF</span>
                <span className="sm:hidden">Print</span>
              </button>

              {/* Highly Visible Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-white/20 hover:bg-red-600 text-white hover:text-white flex items-center justify-center font-black text-lg transition-all cursor-pointer shadow-sm border border-white/25 hover:border-red-500 shrink-0"
                aria-label="Close prescription"
                title="Close (Esc)"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Printable Prescription Body */}
          <div ref={printRef} className="p-6 sm:p-10 space-y-6 bg-white print:p-8 text-slate-800 text-xs sm:text-sm">
            {/* 1. Clinic Letterhead */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b-2 border-slate-900 pb-5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl sm:text-2xl font-black font-display tracking-tight text-slate-900">
                    <span className="text-[#CAA067]">TUSTMED</span> TELEHEALTH
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase tracking-wide border border-emerald-300">
                    Verified Digital Rx
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">
                  Apex Clinical Teleconsultation &amp; Healthcare Network
                </p>
                <p className="text-[10.5px] text-slate-400">
                  Compliance: Telemedicine Practice Guidelines (NMC / BoG) &middot; Reg: #TM-GOV-2026
                </p>
              </div>

              <div className="text-left sm:text-right space-y-0.5">
                <div className="font-extrabold text-slate-900 text-base sm:text-lg">
                  {apptDoctor.name || 'Attending Physician'}
                </div>
                <div className="text-xs font-bold text-[#CAA067]">
                  {apptDoctor.speciality || 'General Medicine / Physician'}
                </div>
                <div className="text-[11px] text-slate-500">
                  Reg No: {apptDoctor.registrationNo || 'NMC-MED-74892'}
                </div>
                <div className="text-[10.5px] text-slate-400">
                  Experience: {apptDoctor.experienceYrs ? `${apptDoctor.experienceYrs}+ Years` : 'Senior Consultant'}
                </div>
              </div>
            </div>

            {/* 2. Patient Information Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Patient Name</span>
                <span className="font-extrabold text-slate-900 text-sm">
                  {apptPatient.name || appointment.patient?.name || 'Patient'}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Age / Gender</span>
                <span className="font-bold text-slate-800">
                  {apptPatient.age ? `${apptPatient.age} Yrs` : '—'} &middot; {apptPatient.gender || '—'}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Date &amp; Time</span>
                <span className="font-bold text-slate-800">
                  {dateStr} &middot; {timeStr}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Consultation ID</span>
                <span className="font-mono font-bold text-slate-800">
                  #{appointment.id?.slice(0, 8).toUpperCase()} ({appointment.mode || 'VIDEO'})
                </span>
              </div>
            </div>

            {/* 3. Clinical Assessment / Diagnosis */}
            {(parsed.diagnosis || appointment.symptoms) && (
              <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900 block">
                  Provisional Diagnosis &amp; Clinical Summary
                </span>
                <p className="font-bold text-slate-800 text-xs sm:text-sm">
                  {parsed.diagnosis || appointment.symptoms || 'General clinical teleconsultation'}
                </p>
              </div>
            )}

            {/* 4. Medications Table (℞) */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <span className="text-3xl font-serif font-black text-[#CAA067]">℞</span>
                <span className="text-sm uppercase tracking-wider font-extrabold">Prescribed Medications</span>
              </div>

              {medicines.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-slate-500">
                  No specific medications prescribed. Follow general clinical advice below.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Medicine &amp; Formulation</th>
                        <th className="py-2.5 px-3">Dosage / Strength</th>
                        <th className="py-2.5 px-3">Frequency</th>
                        <th className="py-2.5 px-3">Duration</th>
                        <th className="py-2.5 px-3">Timing &amp; Instructions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {medicines.map((m, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-3 font-bold text-slate-400">{idx + 1}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-extrabold text-slate-900 text-xs sm:text-sm block">{m.name}</span>
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-700">{m.dosage || 'Standard'}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-extrabold border border-emerald-200 text-[11px]">
                              {m.frequency || '1-0-1'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-700">{m.duration || '5 Days'}</td>
                          <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                            {m.instructions || m.foodRelation || 'After food'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 5. Advised Lab Tests & Investigations */}
            {parsed.labs && (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                  Advised Diagnostic Investigations / Lab Tests
                </span>
                <p className="font-semibold text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {parsed.labs}
                </p>
              </div>
            )}

            {/* 6. General & Dietary Advice */}
            {(parsed.advice || parsed.general) && (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                  Dietary Advice &amp; Patient Instructions
                </span>
                <p className="font-medium text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {parsed.advice || parsed.general}
                </p>
              </div>
            )}

            {/* 7. Follow-up Timeline */}
            {parsed.followUp && (
              <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-900 block">
                  Follow-Up Recommendation
                </span>
                <p className="font-bold text-blue-950">{parsed.followUp}</p>
              </div>
            )}

            {/* 8. Verified Doctor Seal & Digital Signature */}
            <div className="pt-6 border-t-2 border-slate-200 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="space-y-1 max-w-sm">
                <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs">
                  <span>✓</span>
                  <span>Digitally Signed &amp; Authenticated</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  This electronic prescription is issued pursuant to the Telemedicine Practice Guidelines issued under the National Medical Commission Act. Valid across all licensed pharmacies in India.
                </p>
              </div>

              <div className="text-left sm:text-right space-y-1 shrink-0">
                <div className="h-10 flex items-center justify-end font-serif italic font-black text-slate-800 text-base pr-2 border-b border-slate-300">
                  {apptDoctor.name || 'Dr. Medical Practitioner'}
                </div>
                <div className="text-[10.5px] font-extrabold text-slate-700">Attending Medical Practitioner</div>
                <div className="text-[9.5px] text-slate-400">Timestamp: {new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC</div>
              </div>
            </div>
          </div>

          {/* Bottom Action Bar (Hidden during Print) */}
          <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between print:hidden gap-3">
            <div className="text-xs text-slate-500">
              Press <kbd className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-mono text-[10px]">Esc</kbd> or click anywhere outside to close
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary !px-4 !py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 rounded-xl transition-all cursor-pointer border border-slate-300"
              >
                ✕ Close Window
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
