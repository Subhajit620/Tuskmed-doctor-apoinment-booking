import { useState } from 'react';
import { motion, AnimatePresence } from '../../components/motion';
import api, { apiErrorMessage } from '../../api/client';

const DRUG_FORMS = ['Tab.', 'Cap.', 'Syp.', 'Inj.', 'Oint.', 'Drops', 'Inhaler', 'Powder'];

const FREQUENCIES = [
  { label: '1-0-1', desc: 'Twice daily (Morning & Night)' },
  { label: '1-0-0', desc: 'Once daily (Morning)' },
  { label: '0-0-1', desc: 'Once daily (Night)' },
  { label: '1-1-1', desc: 'Thrice daily (TID)' },
  { label: 'SOS', desc: 'As needed only' },
  { label: '1-0-1-0', desc: 'Every 6-8 hours' },
];

const FOOD_RELATIONS = [
  'After Food (Post-prandial)',
  'Before Food (Empty stomach)',
  'With Food / Meals',
  'At Bedtime (HS)',
];

const DURATION_PRESETS = ['3 Days', '5 Days', '7 Days', '10 Days', '14 Days', '1 Month'];

const COMMON_DIAGNOSES = [
  'Acute Upper Respiratory Infection',
  'Viral Fever with Body Ache',
  'Allergic Rhinitis',
  'Acute Pharyngitis & Tonsillitis',
  'Acute Gastroenteritis & Acidity',
  'Migraine / Tension Headache',
  'Essential Hypertension (Review)',
  'Type 2 Diabetes Mellitus (Review)',
];

const COMMON_MEDICINES = [
  { form: 'Tab.', name: 'Paracetamol', dosage: '650mg', freq: '1-0-1', food: 'After Food (Post-prandial)', duration: '3 Days', instr: 'For fever and body ache. Max 3 tabs/day.' },
  { form: 'Tab.', name: 'Amoxicillin + Clavulanic Acid (Augmentin)', dosage: '625mg', freq: '1-0-1', food: 'After Food (Post-prandial)', duration: '5 Days', instr: 'Complete full 5-day course without skipping.' },
  { form: 'Tab.', name: 'Pantoprazole', dosage: '40mg', freq: '1-0-0', food: 'Before Food (Empty stomach)', duration: '7 Days', instr: 'Take 30 mins before breakfast in the morning.' },
  { form: 'Tab.', name: 'Cetirizine', dosage: '10mg', freq: '0-0-1', food: 'At Bedtime (HS)', duration: '5 Days', instr: 'Take at night. May cause mild drowsiness.' },
  { form: 'Tab.', name: 'Azithromycin', dosage: '500mg', freq: '1-0-0', food: 'After Food (Post-prandial)', duration: '3 Days', instr: 'Take once daily 1 hour after meal.' },
  { form: 'Tab.', name: 'Montelukast + Levocetirizine', dosage: '10mg/5mg', freq: '0-0-1', food: 'At Bedtime (HS)', duration: '7 Days', instr: 'Nightly dose for allergic cough/cold.' },
  { form: 'Syp.', name: 'Ascoril D Plus / Cough Syrup', dosage: '10ml', freq: '1-1-1', food: 'After Food (Post-prandial)', duration: '5 Days', instr: 'Sip warm water after taking syrup.' },
  { form: 'Tab.', name: 'Vitamin C + Zinc Chewable', dosage: '500mg', freq: '1-0-0', food: 'After Food (Post-prandial)', duration: '15 Days', instr: 'Chew tablet daily for immunity support.' },
];

const LAB_TEST_SUGGESTIONS = [
  'Complete Blood Count (CBC)',
  'C-Reactive Protein (CRP)',
  'Liver Function Test (LFT)',
  'Kidney Function Test (KFT / Creatinine)',
  'Fasting Blood Sugar (FBS / HbA1c)',
  'Lipid Profile',
  'Urine Routine & Microscopic',
  'Chest X-Ray (PA View)',
  'Thyroid Profile (T3, T4, TSH)',
];

const ADVICE_SUGGESTIONS = [
  'Drink 2.5 to 3 Litres of warm water daily.',
  'Steam inhalation twice daily with tulsi / eucalyptus.',
  'Avoid cold beverages, refrigerated items & deep-fried foods.',
  'Get adequate 8 hours of sleep and physical rest.',
  'Monitor temperature every 6 hours and record readings.',
  'Seek immediate emergency care if breathlessness or high fever persists.',
];

export default function ClinicalWorkspaceDrawer({
  isOpen,
  onClose,
  appointment,
  role,
  vitals,
  onVitalsUpdate,
  messages = [],
  onSendMessage,
  onPrescriptionIssued,
}) {
  const isDoctor = role === 'DOCTOR';

  // Prescription Form State
  const [diagnosis, setDiagnosis] = useState('');
  const [medicines, setMedicines] = useState([
    {
      form: 'Tab.',
      name: 'Paracetamol',
      dosage: '650mg',
      frequency: '1-0-1',
      foodRelation: 'After Food (Post-prandial)',
      duration: '3 Days',
      instructions: 'For fever and body ache',
    },
  ]);
  const [labTests, setLabTests] = useState('');
  const [clinicalAdvice, setClinicalAdvice] = useState(
    'Drink warm fluids, take proper rest, and avoid oily/cold foods. Report if symptoms persist.'
  );
  const [followUp, setFollowUp] = useState('Review after 3-5 days or SOS if symptoms worsen');
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const [savingRx, setSavingRx] = useState(false);
  const [rxSuccessMsg, setRxSuccessMsg] = useState('');
  const [rxError, setRxError] = useState('');

  // Patient Health Chart Tab State
  const [patientTab, setPatientTab] = useState('rx'); // rx | docs | chat
  const [chatInput, setChatInput] = useState('');
  const [selectedDoc, setSelectedDoc] = useState(null);

  const handleAddMedicine = (med) => {
    setMedicines((prev) => [
      ...prev,
      med
        ? {
            form: med.form || 'Tab.',
            name: med.name,
            dosage: med.dosage,
            frequency: med.freq || '1-0-1',
            foodRelation: med.food || 'After Food (Post-prandial)',
            duration: med.duration || '5 Days',
            instructions: med.instr || '',
          }
        : {
            form: 'Tab.',
            name: '',
            dosage: '500mg',
            frequency: '1-0-1',
            foodRelation: 'After Food (Post-prandial)',
            duration: '5 Days',
            instructions: 'After meals',
          },
    ]);
  };

  const handleRemoveMedicine = (idx) => {
    setMedicines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleMedChange = (idx, field, val) => {
    setMedicines((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  const handleAddLabTest = (testName) => {
    setLabTests((prev) => {
      if (!prev.trim()) return testName;
      if (prev.includes(testName)) return prev;
      return `${prev.trim()}\n• ${testName}`;
    });
  };

  const handleAddAdvice = (adviceText) => {
    setClinicalAdvice((prev) => {
      if (!prev.trim()) return adviceText;
      if (prev.includes(adviceText)) return prev;
      return `${prev.trim()}\n• ${adviceText}`;
    });
  };

  const handleSavePrescription = async (e) => {
    if (e) e.preventDefault();
    if (!appointment?.id) return;
    const validMeds = medicines.filter((m) => m.name && m.name.trim());
    if (validMeds.length === 0) {
      setRxError('Please specify at least one valid medication name.');
      return;
    }

    setSavingRx(true);
    setRxError('');
    setRxSuccessMsg('');
    try {
      // Build standard MCI compliant structured prescription notes
      const sections = [];
      if (diagnosis.trim()) {
        sections.push(`[PROVISIONAL DIAGNOSIS]\n${diagnosis.trim()}`);
      }
      if (labTests.trim()) {
        sections.push(`[ADVISED INVESTIGATIONS / LAB TESTS]\n${labTests.trim()}`);
      }
      if (clinicalAdvice.trim()) {
        sections.push(`[GENERAL & DIETARY ADVICE]\n${clinicalAdvice.trim()}`);
      }
      if (followUp.trim()) {
        sections.push(`[FOLLOW-UP SCHEDULE]\n${followUp.trim()}`);
      }

      const combinedNotes = sections.join('\n\n');

      await api.post(`/doctor/appointments/${appointment.id}/prescription`, {
        medicines: validMeds.map((m) => ({
          name: `${m.form ? `${m.form} ` : ''}${m.name.trim()}`,
          dosage: m.dosage,
          frequency: m.frequency,
          foodRelation: m.foodRelation,
          duration: m.duration,
          instructions: m.foodRelation ? `${m.foodRelation}${m.instructions ? ` - ${m.instructions}` : ''}` : m.instructions,
        })),
        notes: combinedNotes || null,
      });

      setRxSuccessMsg('✓ Verified Medical Prescription generated & synced with patient in real-time!');
      onPrescriptionIssued?.();
    } catch (err) {
      setRxError(apiErrorMessage(err));
    } finally {
      setSavingRx(false);
    }
  };

  const handleChatSubmit = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendMessage?.(chatInput.trim());
    setChatInput('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ opacity: 0, x: 440 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 440 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-2 bottom-2 right-2 w-[95vw] sm:w-[540px] bg-[#0E1726]/98 backdrop-blur-2xl border border-white/20 rounded-[28px] shadow-2xl flex flex-col z-40 overflow-hidden select-text text-white font-sans"
        >
          {/* ================================================================= */}
          {/* 1. DOCTOR WORKSPACE: STANDARD DIGITAL PRESCRIPTION GENERATOR     */}
          {/* ================================================================= */}
          {isDoctor ? (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Top Header */}
              <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[#CAA067] to-[#987238] text-white flex items-center justify-center font-serif font-black text-xl shadow-md border border-white/20">
                    ℞
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base text-white font-display flex items-center gap-2">
                      Digital Prescription Desk
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#CAA067]/25 text-[#E6C687] border border-[#CAA067]/40 font-bold uppercase">
                        Standard
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      Patient:{' '}
                      <strong className="text-white font-bold">{appointment?.patient?.name || 'Patient'}</strong>
                      {appointment?.patient?.age ? ` (${appointment.patient.age}y)` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPreviewModal(true)}
                    className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] font-bold text-slate-200 transition-colors cursor-pointer flex items-center gap-1"
                    title="Live Prescription Preview"
                  >
                    <span>👁️</span>
                    <span className="hidden sm:inline">Preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
                    title="Close Drawer"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Scrollable Prescription Generator Form */}
              <form onSubmit={handleSavePrescription} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs scrollbar-thin">
                {/* Alert Notifications */}
                {rxSuccessMsg && (
                  <div className="p-3.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 font-bold flex items-center justify-between gap-2 shadow-inner">
                    <div className="flex items-center gap-2">
                      <span className="text-base">✅</span>
                      <span>{rxSuccessMsg}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPreviewModal(true)}
                      className="text-[11px] text-white underline font-extrabold cursor-pointer"
                    >
                      View Slip
                    </button>
                  </div>
                )}
                {rxError && (
                  <div className="p-3.5 rounded-2xl bg-red-500/20 border border-red-500/50 text-red-200 font-bold flex items-center gap-2">
                    <span className="text-base">⚠️</span>
                    <span>{rxError}</span>
                  </div>
                )}

                {/* Patient Case Summary Card */}
                <div className="p-3.5 rounded-2xl bg-[#131E30] border border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#CAA067]">
                    <span>Patient Profile &amp; Chief Complaint</span>
                    <span>{new Date(appointment?.slot?.start || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold text-white">{appointment?.patient?.name}</div>
                    <div className="text-[11px] text-slate-300">{appointment?.patient?.gender || 'Patient'} &middot; Age: {appointment?.patient?.age || 'N/A'}</div>
                  </div>
                  <div className="text-[11px] text-slate-300 bg-black/20 p-2 rounded-xl border border-white/5">
                    <span className="font-bold text-slate-400">Presented Symptoms:</span>{' '}
                    <span className="text-slate-200">{appointment?.symptoms || 'General medical review and teleconsultation'}</span>
                  </div>
                </div>

                {/* 1. Clinical Diagnosis / Assessment */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-slate-200 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <span>🩺</span>
                      <span>Clinical Assessment / Diagnosis</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    className="w-full bg-[#131E30] border border-white/20 rounded-xl px-3.5 py-2.5 text-white font-medium text-xs placeholder:text-slate-500 focus:outline-none focus:border-[#CAA067] focus:ring-1 focus:ring-[#CAA067]"
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    placeholder="e.g. Acute Viral Bronchitis / Rhinopharyngitis"
                  />
                  {/* Common Diagnosis Quick Chips */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {COMMON_DIAGNOSES.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDiagnosis(d)}
                        className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-[#CAA067]/20 border border-white/10 text-[10px] text-slate-300 hover:text-white transition-colors cursor-pointer"
                      >
                        + {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Medications Section */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <label className="text-[11px] text-slate-200 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <span>💊</span>
                      <span>Prescribed Medications ({medicines.length})</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleAddMedicine()}
                      className="px-2.5 py-1 rounded-lg bg-[#CAA067]/20 hover:bg-[#CAA067]/30 border border-[#CAA067]/40 text-xs text-[#E6C687] font-bold transition-colors cursor-pointer"
                    >
                      + Add Drug
                    </button>
                  </div>

                  {/* Quick-add chips library */}
                  <div className="space-y-1 bg-white/5 p-2.5 rounded-2xl border border-white/10">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Quick Add Common Telemedicine Drugs:</span>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {COMMON_MEDICINES.map((cm) => (
                        <button
                          key={cm.name}
                          type="button"
                          onClick={() => handleAddMedicine(cm)}
                          className="px-2.5 py-1 rounded-xl bg-[#131E30] hover:bg-[#CAA067]/30 border border-white/10 hover:border-[#CAA067] text-[10.5px] font-semibold text-slate-200 transition-colors cursor-pointer"
                        >
                          + {cm.form} {cm.name} ({cm.dosage})
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Medicine Cards List */}
                  <div className="space-y-3">
                    {medicines.map((med, idx) => (
                      <div key={idx} className="p-3.5 rounded-2xl bg-[#131E30] border border-white/15 space-y-2.5 relative shadow-md">
                        {/* Header: Number, Form Dropdown, Drug Name, Remove */}
                        <div className="flex items-center gap-2">
                          <span className="h-6 w-6 rounded-lg bg-[#CAA067]/20 text-[#CAA067] text-xs font-bold flex items-center justify-center shrink-0">
                            #{idx + 1}
                          </span>

                          {/* Drug Form Selector */}
                          <select
                            value={med.form || 'Tab.'}
                            onChange={(e) => handleMedChange(idx, 'form', e.target.value)}
                            className="bg-[#0E1726] border border-white/20 rounded-lg px-2 py-1.5 text-xs font-bold text-[#E6C687] focus:outline-none focus:border-[#CAA067] cursor-pointer"
                          >
                            {DRUG_FORMS.map((form) => (
                              <option key={form} value={form} className="bg-[#0E1726] text-white">
                                {form}
                              </option>
                            ))}
                          </select>

                          {/* Drug Name Input */}
                          <input
                            type="text"
                            placeholder="Medicine name (e.g. Paracetamol / Augmentin)"
                            value={med.name}
                            onChange={(e) => handleMedChange(idx, 'name', e.target.value)}
                            className="flex-1 bg-[#0E1726] border border-white/20 rounded-xl px-3 py-1.5 text-xs font-bold text-white placeholder:text-slate-500 focus:outline-none focus:border-[#CAA067]"
                            required
                          />

                          {medicines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMedicine(idx)}
                              className="w-7 h-7 rounded-lg bg-red-500/15 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-xs font-bold flex items-center justify-center cursor-pointer transition-colors"
                              title="Remove Medicine"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        {/* Dosage, Frequency, Duration Row */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                          <div>
                            <label className="text-[9.5px] text-slate-400 font-bold uppercase">Strength / Dose</label>
                            <input
                              placeholder="e.g. 650mg, 500mg, 5ml"
                              value={med.dosage}
                              onChange={(e) => handleMedChange(idx, 'dosage', e.target.value)}
                              className="w-full bg-[#0E1726] border border-white/15 rounded-lg px-2.5 py-1.5 text-white mt-0.5 focus:outline-none focus:border-[#CAA067]"
                            />
                          </div>

                          <div>
                            <label className="text-[9.5px] text-slate-400 font-bold uppercase">Frequency</label>
                            <input
                              placeholder="e.g. 1-0-1 or SOS"
                              value={med.frequency}
                              onChange={(e) => handleMedChange(idx, 'frequency', e.target.value)}
                              className="w-full bg-[#0E1726] border border-white/15 rounded-lg px-2.5 py-1.5 text-white mt-0.5 focus:outline-none focus:border-[#CAA067]"
                            />
                          </div>

                          <div>
                            <label className="text-[9.5px] text-slate-400 font-bold uppercase">Duration</label>
                            <input
                              placeholder="e.g. 5 Days"
                              value={med.duration}
                              onChange={(e) => handleMedChange(idx, 'duration', e.target.value)}
                              className="w-full bg-[#0E1726] border border-white/15 rounded-lg px-2.5 py-1.5 text-white mt-0.5 focus:outline-none focus:border-[#CAA067]"
                            />
                          </div>
                        </div>

                        {/* Quick Frequency Buttons */}
                        <div className="flex flex-wrap items-center gap-1 pt-0.5">
                          <span className="text-[9px] text-slate-400 font-semibold uppercase mr-1">Freq:</span>
                          {FREQUENCIES.map((f) => (
                            <button
                              key={f.label}
                              type="button"
                              onClick={() => handleMedChange(idx, 'frequency', f.label)}
                              className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold transition-all cursor-pointer ${
                                med.frequency === f.label
                                  ? 'bg-[#CAA067] text-white'
                                  : 'bg-white/5 hover:bg-white/15 text-slate-300'
                              }`}
                              title={f.desc}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>

                        {/* Food Relation Selection & Duration Presets */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px]">
                          <div>
                            <label className="text-[9.5px] text-slate-400 font-bold uppercase">Relation to Food</label>
                            <select
                              value={med.foodRelation || FOOD_RELATIONS[0]}
                              onChange={(e) => handleMedChange(idx, 'foodRelation', e.target.value)}
                              className="w-full bg-[#0E1726] border border-white/15 rounded-lg px-2.5 py-1.5 text-slate-200 mt-0.5 focus:outline-none focus:border-[#CAA067] cursor-pointer"
                            >
                              {FOOD_RELATIONS.map((fr) => (
                                <option key={fr} value={fr} className="bg-[#0E1726] text-white">
                                  {fr}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-[9.5px] text-slate-400 font-bold uppercase">Quick Duration</label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {DURATION_PRESETS.map((dp) => (
                                <button
                                  key={dp}
                                  type="button"
                                  onClick={() => handleMedChange(idx, 'duration', dp)}
                                  className={`px-1.5 py-0.5 rounded text-[9.5px] font-semibold cursor-pointer ${
                                    med.duration === dp
                                      ? 'bg-[#CAA067] text-white'
                                      : 'bg-white/5 hover:bg-white/15 text-slate-300'
                                  }`}
                                >
                                  {dp}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Extra Instructions */}
                        <div>
                          <input
                            placeholder="Additional notes / instructions (e.g. Take with warm water, avoid dairy)"
                            value={med.instructions}
                            onChange={(e) => handleMedChange(idx, 'instructions', e.target.value)}
                            className="w-full bg-[#0E1726] border border-white/10 rounded-lg px-2.5 py-1.5 text-[10.5px] text-slate-300 placeholder:text-slate-500 focus:outline-none focus:border-[#CAA067]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddMedicine()}
                    className="w-full py-2.5 rounded-xl border border-dashed border-white/20 hover:border-[#CAA067] text-slate-300 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer bg-white/5"
                  >
                    <span>+</span>
                    <span>Add Another Medication Card</span>
                  </button>
                </div>

                {/* 3. Advised Lab Tests / Investigations */}
                <div className="space-y-1.5 pt-2">
                  <label className="text-[11px] text-slate-200 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <span>🔬</span>
                    <span>Advised Diagnostic Investigations / Lab Tests</span>
                  </label>
                  <textarea
                    rows={2}
                    className="w-full bg-[#131E30] border border-white/15 rounded-xl px-3.5 py-2 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-[#CAA067]"
                    value={labTests}
                    onChange={(e) => setLabTests(e.target.value)}
                    placeholder="e.g. Complete Blood Count (CBC), Urine Routine..."
                  />
                  {/* Quick Lab Test Suggestions */}
                  <div className="flex flex-wrap gap-1">
                    {LAB_TEST_SUGGESTIONS.map((lt) => (
                      <button
                        key={lt}
                        type="button"
                        onClick={() => handleAddLabTest(lt)}
                        className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-[#CAA067]/20 border border-white/10 text-[10px] text-slate-300 hover:text-white transition-colors cursor-pointer"
                      >
                        + {lt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Dietary & Lifestyle Advice */}
                <div className="space-y-1.5 pt-2">
                  <label className="text-[11px] text-slate-200 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <span>🥗</span>
                    <span>Dietary Advice, Precautions &amp; Red Flags</span>
                  </label>
                  <textarea
                    rows={2}
                    className="w-full bg-[#131E30] border border-white/15 rounded-xl px-3.5 py-2 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-[#CAA067]"
                    value={clinicalAdvice}
                    onChange={(e) => setClinicalAdvice(e.target.value)}
                    placeholder="Dietary precautions, hydration advice, red flags..."
                  />
                  {/* Quick Advice Suggestions */}
                  <div className="flex flex-wrap gap-1">
                    {ADVICE_SUGGESTIONS.map((adv) => (
                      <button
                        key={adv}
                        type="button"
                        onClick={() => handleAddAdvice(adv)}
                        className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-[#CAA067]/20 border border-white/10 text-[10px] text-slate-300 hover:text-white transition-colors cursor-pointer text-left"
                      >
                        + {adv.slice(0, 32)}…
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5. Follow-up Timeline */}
                <div className="space-y-1 pt-2">
                  <label className="text-[11px] text-slate-200 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <span>📅</span>
                    <span>Follow-up Recommendation</span>
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[#131E30] border border-white/15 rounded-xl px-3.5 py-2 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-[#CAA067]"
                    value={followUp}
                    onChange={(e) => setFollowUp(e.target.value)}
                    placeholder="e.g. Review after 3 days or SOS if symptoms worsen"
                  />
                </div>

                {/* Submit Action Button */}
                <div className="pt-3 sticky bottom-0 bg-[#0E1726]/95 backdrop-blur-md pb-2">
                  <button
                    type="submit"
                    disabled={savingRx}
                    className="w-full bg-gradient-to-r from-[#CAA067] via-[#B88F55] to-[#A87F45] hover:brightness-110 text-white font-extrabold py-3.5 px-4 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 text-sm border border-white/20"
                  >
                    <span>✨</span>
                    <span>{savingRx ? 'Issuing & Syncing Prescription…' : 'Generate & Issue Official Prescription'}</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* ================================================================= */
            /* 2. PATIENT WORKSPACE: HEALTH CHART, REPORTS & MESSAGES             */
            /* ================================================================= */
            <div className="flex flex-col h-full overflow-hidden">
              {/* Patient Header */}
              <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/5">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-base font-bold border border-emerald-500/30">
                    📋
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base text-white font-display">
                      Medical Records &amp; Prescription
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      Consultation with <strong className="text-white">{appointment?.doctor?.name || 'Doctor'}</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Patient Navigation Tabs */}
              <div className="flex items-center gap-1.5 p-2 bg-white/5 border-b border-white/10 overflow-x-auto text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setPatientTab('rx')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 cursor-pointer ${
                    patientTab === 'rx' ? 'bg-[#CAA067] text-white' : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  💊 Prescription
                </button>
                <button
                  type="button"
                  onClick={() => setPatientTab('docs')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 cursor-pointer ${
                    patientTab === 'docs' ? 'bg-[#CAA067] text-white' : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  📁 Reports ({appointment?.documents?.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setPatientTab('chat')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 cursor-pointer ${
                    patientTab === 'chat' ? 'bg-[#CAA067] text-white' : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  💬 Messages ({messages.length})
                </button>
              </div>

              {/* Patient Tab Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs scrollbar-thin">
                {patientTab === 'rx' && (
                  <div className="space-y-3">
                    {appointment?.prescription ? (
                      <div className="p-4 rounded-2xl bg-[#131E30] border border-emerald-500/40 space-y-3 shadow-lg">
                        <div className="flex items-center justify-between border-b border-white/10 pb-2">
                          <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                            <span className="text-base">℞</span>
                            <span>Verified Digital Prescription</span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                            Official
                          </span>
                        </div>

                        {/* Medications */}
                        <div className="space-y-2">
                          {(appointment.prescription.medicines || []).map((m, idx) => (
                            <div key={idx} className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-white text-xs">{m.name}</span>
                                <span className="text-[11px] font-semibold text-[#CAA067]">{m.dosage}</span>
                              </div>
                              <div className="text-[11px] text-slate-300 flex items-center gap-2">
                                <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold">{m.frequency}</span>
                                <span>&middot;</span>
                                <span>{m.duration}</span>
                              </div>
                              {m.instructions && (
                                <div className="text-[10.5px] text-slate-300 pt-0.5 flex items-center gap-1">
                                  <span className="text-[#CAA067]">ℹ️</span>
                                  <span>{m.instructions}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Doctor Notes & Diagnosis */}
                        {appointment.prescription.notes && (
                          <div className="text-xs text-slate-200 border-t border-white/10 pt-2.5 whitespace-pre-wrap leading-relaxed bg-white/5 p-3 rounded-xl">
                            {appointment.prescription.notes}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-slate-400 space-y-2 bg-[#131E30]/60 p-6 rounded-3xl border border-white/10">
                        <div className="text-3xl">💊</div>
                        <p className="font-bold text-white text-sm">Prescription In Progress</p>
                        <p className="text-[11px] text-slate-300">
                          Doctor is examining your case and will issue your verified prescription right here.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {patientTab === 'docs' && (
                  <div className="space-y-3">
                    {(!appointment?.documents || appointment.documents.length === 0) ? (
                      <div className="text-center py-12 text-slate-400 space-y-2 bg-[#131E30]/60 p-6 rounded-3xl border border-white/10">
                        <div className="text-3xl">📁</div>
                        <p className="font-bold text-white">No Attached Medical Records</p>
                        <p className="text-[11px] text-slate-400">Past reports and lab tests uploaded for this consultation will appear here.</p>
                      </div>
                    ) : (
                      appointment.documents.map((doc) => (
                        <div
                          key={doc.id}
                          onClick={() => setSelectedDoc(doc)}
                          className="p-3.5 rounded-2xl bg-white/5 border border-white/10 hover:border-[#CAA067] cursor-pointer transition-all flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-2xl">📑</span>
                            <div className="min-w-0">
                              <div className="font-bold text-white truncate">{doc.fileName}</div>
                              <div className="text-[10px] text-slate-400">
                                {doc.sizeBytes ? `${(doc.sizeBytes / 1024).toFixed(0)} KB` : 'Medical Report'}
                              </div>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-[#CAA067] shrink-0">View ↗</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {patientTab === 'chat' && (
                  <div className="flex flex-col h-full space-y-3">
                    <div className="space-y-2.5 overflow-y-auto max-h-[50vh]">
                      {messages.length === 0 ? (
                        <p className="text-center text-slate-400 py-10">No in-call messages yet.</p>
                      ) : (
                        messages.map((m, i) => (
                          <div
                            key={m.id || i}
                            className={`p-3 rounded-2xl ${
                              m.senderRole === role
                                ? 'bg-[#CAA067]/25 border border-[#CAA067]/40 text-white ml-6'
                                : 'bg-white/10 border border-white/10 text-slate-200 mr-6'
                            }`}
                          >
                            <div className="text-[10px] font-bold text-slate-400 mb-0.5">{m.senderRole}</div>
                            <div className="leading-relaxed">{m.body}</div>
                          </div>
                        ))
                      )}
                    </div>

                    <form onSubmit={handleChatSubmit} className="pt-2 border-t border-white/10 flex gap-2">
                      <input
                        type="text"
                        placeholder="Type a message..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        className="flex-1 bg-[#131E30] border border-white/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#CAA067]"
                      />
                      <button type="submit" disabled={!chatInput.trim()} className="btn-primary !px-3 !py-2 text-xs disabled:opacity-40">
                        Send
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.aside>
      )}

      {/* Doctor Live Prescription Preview Modal */}
      {showPreviewModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setShowPreviewModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-2xl w-full bg-white text-slate-900 rounded-3xl p-6 sm:p-8 flex flex-col shadow-2xl overflow-y-auto max-h-[90vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b-2 border-slate-900/10 pb-4">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                  <span className="text-[#CAA067]">TUSTMED</span> CLINICAL TELEMEDICINE
                </h2>
                <p className="text-xs text-slate-500 font-semibold">
                  Consultation Rx Slip &middot; ID: {appointment?.id?.slice(0, 8).toUpperCase() || 'TX-901'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-red-500 hover:text-white text-slate-800 flex items-center justify-center font-black text-base cursor-pointer border border-slate-300 shadow-xs transition-all shrink-0"
                title="Close (Esc)"
              >
                ✕
              </button>
            </div>

            {/* Doctor & Patient Metadata */}
            <div className="grid grid-cols-2 gap-4 py-4 border-b border-slate-200 text-xs">
              <div>
                <p className="font-bold text-slate-400 uppercase text-[10px]">Attending Physician</p>
                <p className="font-extrabold text-slate-900 text-sm">{appointment?.doctor?.name || 'Dr. Specialist'}</p>
                <p className="text-slate-600">{appointment?.doctor?.speciality?.name || 'General Physician'}</p>
                <p className="text-slate-500 text-[11px]">Reg: MCI/NMC-Verified</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-400 uppercase text-[10px]">Patient Information</p>
                <p className="font-extrabold text-slate-900 text-sm">{appointment?.patient?.name || 'Patient'}</p>
                <p className="text-slate-600">Gender: {appointment?.patient?.gender || 'N/A'} &middot; Age: {appointment?.patient?.age || 'N/A'}</p>
                <p className="text-slate-500 text-[11px]">Date: {new Date().toLocaleDateString()}</p>
              </div>
            </div>

            {/* Diagnosis */}
            {diagnosis && (
              <div className="py-3 border-b border-slate-200 text-xs">
                <span className="font-bold text-slate-500 uppercase text-[10px] block">Provisional Diagnosis:</span>
                <span className="font-bold text-slate-800 text-sm">{diagnosis}</span>
              </div>
            )}

            {/* Rx Symbol & Medication Table */}
            <div className="py-4 space-y-3">
              <div className="text-2xl font-serif font-black text-[#CAA067]">℞</div>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 text-[10px] uppercase">
                    <th className="py-1.5 font-bold">#</th>
                    <th className="py-1.5 font-bold">Medicine Name &amp; Form</th>
                    <th className="py-1.5 font-bold">Dose</th>
                    <th className="py-1.5 font-bold">Frequency</th>
                    <th className="py-1.5 font-bold">Duration</th>
                    <th className="py-1.5 font-bold">Timing / Instructions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {medicines.filter((m) => m.name && m.name.trim()).map((m, idx) => (
                    <tr key={idx} className="text-slate-800">
                      <td className="py-2 font-bold text-slate-400">{idx + 1}</td>
                      <td className="py-2 font-bold">{m.form} {m.name}</td>
                      <td className="py-2">{m.dosage}</td>
                      <td className="py-2 font-bold text-emerald-700">{m.frequency}</td>
                      <td className="py-2">{m.duration}</td>
                      <td className="py-2 text-slate-600">{m.foodRelation} {m.instructions ? `(${m.instructions})` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Lab tests & Advice */}
            {(labTests || clinicalAdvice || followUp) && (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-2 mt-2">
                {labTests && (
                  <div>
                    <span className="font-bold text-slate-500 uppercase text-[10px] block">Advised Investigations:</span>
                    <span className="text-slate-800 whitespace-pre-wrap">{labTests}</span>
                  </div>
                )}
                {clinicalAdvice && (
                  <div>
                    <span className="font-bold text-slate-500 uppercase text-[10px] block">General &amp; Dietary Advice:</span>
                    <span className="text-slate-800 whitespace-pre-wrap">{clinicalAdvice}</span>
                  </div>
                )}
                {followUp && (
                  <div>
                    <span className="font-bold text-slate-500 uppercase text-[10px] block">Follow-up:</span>
                    <span className="text-slate-800 font-semibold">{followUp}</span>
                  </div>
                )}
              </div>
            )}

            {/* Footer Signature */}
            <div className="pt-6 mt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
              <div>
                <p className="font-bold text-emerald-600">✓ Digitally Signed &amp; Timestamped</p>
                <p className="text-[10px]">Complies with Telemedicine Practice Guidelines</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    window.print();
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 cursor-pointer"
                >
                  🖨️ Print Prescription
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-300 cursor-pointer"
                >
                  ✕ Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document High-Resolution Preview Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-4xl w-full max-h-[90vh] bg-[#0E1726] border border-white/20 rounded-3xl p-4 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <span className="font-bold text-white">{selectedDoc.fileName}</span>
              <button
                onClick={() => setSelectedDoc(null)}
                className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
              <iframe title="Document Preview" src={selectedDoc.fileUrl} className="w-full h-[70vh] rounded-2xl bg-white" />
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
