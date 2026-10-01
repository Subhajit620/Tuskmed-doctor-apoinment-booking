import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AnimatePresence, motion } from '../../components/motion';

const VITAL_SIGNS_LIST = [
  { key: 'TEMP', name: 'Temperature (Deg Farenheit)', shortName: 'Body Temperature', unit: '°F', min: 90, max: 110, step: '0.1', normalRange: '97.8 - 99.1 °F', isNormal: (v) => v >= 97.0 && v <= 99.5, placeholder: 'e.g. 98.6', iconType: 'temp', gradient: 'from-amber-500/10 via-orange-500/5 to-transparent' },
  { key: 'BP_DIASTOLIC', name: 'Blood pressure diastolic (lower) (mm Hg)', shortName: 'BP Diastolic (Lower)', unit: 'mm Hg', min: 30, max: 150, step: '1', normalRange: '60 - 80 mm Hg', isNormal: (v) => v >= 60 && v <= 80, placeholder: 'e.g. 80', iconType: 'heart-pulse', gradient: 'from-blue-500/10 via-indigo-500/5 to-transparent' },
  { key: 'BP_SYSTOLIC', name: 'Blood Pressure Systolic (Upper) (mm Hg)', shortName: 'BP Systolic (Upper)', unit: 'mm Hg', min: 50, max: 250, step: '1', normalRange: '90 - 120 mm Hg', isNormal: (v) => v >= 90 && v <= 120, placeholder: 'e.g. 120', iconType: 'heart', gradient: 'from-rose-500/10 via-red-500/5 to-transparent' },
  { key: 'SPO2', name: 'Oxygen Level by Pulse Oximeter (SpO2 %)', shortName: 'Oxygen Saturation', unit: '%', min: 50, max: 100, step: '1', normalRange: '95 - 100 %', isNormal: (v) => v >= 95, placeholder: 'e.g. 99', iconType: 'activity', gradient: 'from-cyan-500/10 via-teal-500/5 to-transparent' },
  { key: 'PULSE', name: 'Pulse (bpm)', shortName: 'Heart Pulse Rate', unit: 'bpm', min: 30, max: 220, step: '1', normalRange: '60 - 100 bpm', isNormal: (v) => v >= 60 && v <= 100, placeholder: 'e.g. 72', iconType: 'pulse', gradient: 'from-pink-500/10 via-rose-500/5 to-transparent' },
  { key: 'HEIGHT', name: 'Height (Inch)', shortName: 'Body Height', unit: 'Inch', min: 10, max: 100, step: '0.5', normalRange: 'Standard', isNormal: () => true, placeholder: 'e.g. 68', iconType: 'ruler', gradient: 'from-emerald-500/10 via-teal-500/5 to-transparent' },
  { key: 'WEIGHT', name: 'Weight (Kg)', shortName: 'Body Weight', unit: 'Kg', min: 1, max: 300, step: '0.1', normalRange: '18.5 - 24.9 BMI', isNormal: () => true, placeholder: 'e.g. 68.5', iconType: 'scale', gradient: 'from-purple-500/10 via-violet-500/5 to-transparent' },
];

const LAB_PARAMETERS_LIST = [
  { key: 'BS_FASTING', name: 'Blood Sugar Fasting', shortName: 'Fasting Glucose', unit: 'mg/dL', min: 30, max: 600, step: '1', normalRange: '70 - 99 mg/dL', isNormal: (v) => v >= 70 && v <= 99, placeholder: 'e.g. 95', iconType: 'droplet', gradient: 'from-blue-500/10 via-sky-500/5 to-transparent' },
  { key: 'BS_NORMAL', name: 'Blood Sugar Normal', shortName: 'Post-Meal Glucose', unit: 'mg/dL', min: 30, max: 600, step: '1', normalRange: '70 - 140 mg/dL', isNormal: (v) => v >= 70 && v <= 140, placeholder: 'e.g. 110', iconType: 'droplet', gradient: 'from-sky-500/10 via-blue-500/5 to-transparent' },
  { key: 'HBA1C', name: 'HbA1c', shortName: 'Glycated Hemoglobin', unit: '%', min: 3, max: 20, step: '0.1', normalRange: '< 5.7 %', isNormal: (v) => v < 5.7, placeholder: 'e.g. 5.4', iconType: 'chart', gradient: 'from-indigo-500/10 via-violet-500/5 to-transparent' },
  { key: 'LDL', name: 'LDL Cholestrol', shortName: 'LDL (Bad) Cholestrol', unit: 'mg/dL', min: 10, max: 400, step: '1', normalRange: '< 100 mg/dL', isNormal: (v) => v < 100, placeholder: 'e.g. 90', iconType: 'flask', gradient: 'from-amber-500/10 via-orange-500/5 to-transparent' },
  { key: 'HDL', name: 'HDL Cholestrol', shortName: 'HDL (Good) Cholestrol', unit: 'mg/dL', min: 10, max: 150, step: '1', normalRange: '> 40 mg/dL', isNormal: (v) => v >= 40, placeholder: 'e.g. 50', iconType: 'flask', gradient: 'from-emerald-500/10 via-teal-500/5 to-transparent' },
  { key: 'TOTAL_CHOLESTROL', name: 'Total Cholestrol', shortName: 'Total Lipid Count', unit: 'mg/dL', min: 50, max: 500, step: '1', normalRange: '< 200 mg/dL', isNormal: (v) => v < 200, placeholder: 'e.g. 175', iconType: 'flask', gradient: 'from-rose-500/10 via-pink-500/5 to-transparent' },
  { key: 'HEMOGLOBIN', name: 'Hemoglobin', shortName: 'Hemoglobin (Hb)', unit: 'g/dL', min: 2, max: 25, step: '0.1', normalRange: '13.5 - 17.5 g/dL', isNormal: (v) => v >= 12 && v <= 17.5, placeholder: 'e.g. 14.5', iconType: 'droplet', gradient: 'from-red-500/10 via-rose-500/5 to-transparent' },
  { key: 'TLC', name: 'TLC', shortName: 'Total Leukocyte Count', unit: 'cells/mcL', min: 500, max: 50000, step: '50', normalRange: '4,000 - 11,000', isNormal: (v) => v >= 4000 && v <= 11000, placeholder: 'e.g. 6500', iconType: 'shield', gradient: 'from-violet-500/10 via-purple-500/5 to-transparent' },
  { key: 'PLATELETS', name: 'Platelets', shortName: 'Blood Platelet Count', unit: 'lakh/mcL', min: 0.1, max: 10, step: '0.1', normalRange: '1.5 - 4.5 lakh', isNormal: (v) => v >= 1.5 && v <= 4.5, placeholder: 'e.g. 2.5', iconType: 'droplet', gradient: 'from-teal-500/10 via-emerald-500/5 to-transparent' },
  { key: 'S_CREATININE', name: 'S Creatinine', shortName: 'Serum Creatinine', unit: 'mg/dL', min: 0.1, max: 15, step: '0.05', normalRange: '0.7 - 1.3 mg/dL', isNormal: (v) => v >= 0.6 && v <= 1.3, placeholder: 'e.g. 0.9', iconType: 'flask', gradient: 'from-blue-500/10 via-indigo-500/5 to-transparent' },
  { key: 'SGOT', name: 'SGOT', shortName: 'AST / SGOT Liver', unit: 'U/L', min: 1, max: 500, step: '1', normalRange: '8 - 45 U/L', isNormal: (v) => v >= 8 && v <= 45, placeholder: 'e.g. 24', iconType: 'flask', gradient: 'from-orange-500/10 via-amber-500/5 to-transparent' },
  { key: 'SGPT', name: 'SGPT', shortName: 'ALT / SGPT Liver', unit: 'U/L', min: 1, max: 500, step: '1', normalRange: '7 - 56 U/L', isNormal: (v) => v >= 7 && v <= 56, placeholder: 'e.g. 28', iconType: 'flask', gradient: 'from-yellow-500/10 via-amber-500/5 to-transparent' },
  { key: 'PSA', name: 'PSA', shortName: 'Prostate Specific Ag', unit: 'ng/mL', min: 0, max: 100, step: '0.1', normalRange: '< 4.0 ng/mL', isNormal: (v) => v < 4.0, placeholder: 'e.g. 1.2', iconType: 'flask', gradient: 'from-slate-500/10 via-blue-500/5 to-transparent' },
];

function ParamIcon({ type, className = 'w-5 h-5' }) {
  switch (type) {
    case 'temp':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
        </svg>
      );
    case 'heart-pulse':
    case 'pulse':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case 'heart':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      );
    case 'activity':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      );
    case 'ruler':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M2 12h20M2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6M2 12V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6" />
          <line x1="6" y1="4" x2="6" y2="8" />
          <line x1="10" y1="4" x2="10" y2="8" />
          <line x1="14" y1="4" x2="14" y2="8" />
          <line x1="18" y1="4" x2="18" y2="8" />
        </svg>
      );
    case 'scale':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M12 3v18M6 8l6-5 6 5M6 8l-4 8h8L6 8zM18 8l-4 8h8l-4-8z" />
        </svg>
      );
    case 'droplet':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
        </svg>
      );
    case 'flask':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M9 3h6M10 9h4M10 3v6l-4 11a1 1 0 0 0 .9 1.5h14.2a1 1 0 0 0 .9-1.5L14 9V3" />
        </svg>
      );
    case 'chart':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case 'shield':
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
  }
}

export default function HealthMonitoring() {
  const { activePatient } = useAuth();
  const [activeTab, setActiveTab] = useState('VITAL_SIGNS'); // 'VITAL_SIGNS' | 'LAB_PARAMETERS'
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [readings, setReadings] = useState([]);
  const [historyParam, setHistoryParam] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Custom Dropdown State for smooth experience
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Form State
  const [selectedParam, setSelectedParam] = useState('');
  const [value, setValue] = useState('');
  const [readingDate, setReadingDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [readingTime, setReadingTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });

  // Close custom dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load saved readings for active patient
  useEffect(() => {
    if (!activePatient) return;
    const stored = localStorage.getItem(`tuskmed_patient_readings_${activePatient.id}`);
    if (stored) {
      try {
        setReadings(JSON.parse(stored));
      } catch (e) {
        setReadings([]);
      }
    } else {
      const initial = [
        { id: '1', paramName: 'Temperature (Deg Farenheit)', value: '98.6', unit: '°F', date: '2026-09-05', time: '08:30', timestamp: new Date('2026-09-05T08:30:00').getTime(), category: 'VITAL_SIGNS' },
        { id: '2', paramName: 'Blood pressure diastolic (lower) (mm Hg)', value: '80', unit: 'mm Hg', date: '2026-09-05', time: '08:30', timestamp: new Date('2026-09-05T08:30:00').getTime(), category: 'VITAL_SIGNS' },
        { id: '3', paramName: 'Blood Pressure Systolic (Upper) (mm Hg)', value: '120', unit: 'mm Hg', date: '2026-09-05', time: '08:30', timestamp: new Date('2026-09-05T08:30:00').getTime(), category: 'VITAL_SIGNS' },
        { id: '4', paramName: 'Oxygen Level by Pulse Oximeter (SpO2 %)', value: '99', unit: '%', date: '2026-09-05', time: '08:30', timestamp: new Date('2026-09-05T08:30:00').getTime(), category: 'VITAL_SIGNS' },
        { id: '5', paramName: 'Pulse (bpm)', value: '72', unit: 'bpm', date: '2026-09-05', time: '08:30', timestamp: new Date('2026-09-05T08:30:00').getTime(), category: 'VITAL_SIGNS' },
        { id: '6', paramName: 'Height (Inch)', value: '68', unit: 'Inch', date: '2026-09-05', time: '08:30', timestamp: new Date('2026-09-05T08:30:00').getTime(), category: 'VITAL_SIGNS' },
        { id: '7', paramName: 'Weight (Kg)', value: '68.5', unit: 'Kg', date: '2026-09-05', time: '08:30', timestamp: new Date('2026-09-05T08:30:00').getTime(), category: 'VITAL_SIGNS' },
        { id: '8', paramName: 'Blood Sugar Fasting', value: '95', unit: 'mg/dL', date: '2026-09-05', time: '08:00', timestamp: new Date('2026-09-05T08:00:00').getTime(), category: 'LAB_PARAMETERS' },
        { id: '9', paramName: 'Blood Sugar Normal', value: '110', unit: 'mg/dL', date: '2026-09-05', time: '13:00', timestamp: new Date('2026-09-05T13:00:00').getTime(), category: 'LAB_PARAMETERS' },
        { id: '10', paramName: 'HbA1c', value: '5.4', unit: '%', date: '2026-09-01', time: '10:00', timestamp: new Date('2026-09-01T10:00:00').getTime(), category: 'LAB_PARAMETERS' },
        { id: '11', paramName: 'Total Cholestrol', value: '175', unit: 'mg/dL', date: '2026-09-01', time: '10:00', timestamp: new Date('2026-09-01T10:00:00').getTime(), category: 'LAB_PARAMETERS' },
      ];
      setReadings(initial);
      localStorage.setItem(`tuskmed_patient_readings_${activePatient.id}`, JSON.stringify(initial));
    }
  }, [activePatient]);

  const saveReading = (e) => {
    e?.preventDefault();
    setErrorMsg('');

    if (!selectedParam) {
      setErrorMsg('Please select a health parameter.');
      return;
    }

    const numVal = parseFloat(value);
    if (isNaN(numVal) || !isFinite(numVal)) {
      setErrorMsg('Please enter a valid numeric measurement.');
      return;
    }

    const allParams = [...VITAL_SIGNS_LIST, ...LAB_PARAMETERS_LIST];
    const targetObj = allParams.find((p) => p.name === selectedParam) || { unit: '', name: selectedParam };

    // Range safety validation
    if (targetObj.min !== undefined && numVal < targetObj.min) {
      setErrorMsg(`Measurement seems unusually low for ${targetObj.shortName || targetObj.name} (minimum expected ~${targetObj.min} ${targetObj.unit}).`);
      return;
    }
    if (targetObj.max !== undefined && numVal > targetObj.max) {
      setErrorMsg(`Measurement seems unusually high for ${targetObj.shortName || targetObj.name} (maximum expected ~${targetObj.max} ${targetObj.unit}).`);
      return;
    }

    const isLab = LAB_PARAMETERS_LIST.some((p) => p.name === selectedParam);
    const dateStr = readingDate || new Date().toISOString().split('T')[0];
    const timeStr = readingTime || '00:00';
    const timestamp = new Date(`${dateStr}T${timeStr}:00`).getTime() || Date.now();

    const newReading = {
      id: 'r_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      paramName: targetObj.name,
      value: numVal.toString(),
      unit: targetObj.unit,
      date: dateStr,
      time: timeStr,
      timestamp,
      category: isLab ? 'LAB_PARAMETERS' : 'VITAL_SIGNS',
    };

    const updated = [newReading, ...readings].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    setReadings(updated);
    if (activePatient) {
      localStorage.setItem(`tuskmed_patient_readings_${activePatient.id}`, JSON.stringify(updated));
    }

    // Reset & Close
    setSelectedParam('');
    setValue('');
    setErrorMsg('');
    setShowModal(false);
  };

  const deleteReading = (id) => {
    const updated = readings.filter((r) => r.id !== id);
    setReadings(updated);
    if (activePatient) {
      localStorage.setItem(`tuskmed_patient_readings_${activePatient.id}`, JSON.stringify(updated));
    }
  };

  const currentList = activeTab === 'VITAL_SIGNS' ? VITAL_SIGNS_LIST : LAB_PARAMETERS_LIST;
  const filteredParams = currentList.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    item.shortName.toLowerCase().includes(search.toLowerCase()) ||
    item.unit.toLowerCase().includes(search.toLowerCase())
  );

  const activeParamDef = [...VITAL_SIGNS_LIST, ...LAB_PARAMETERS_LIST].find((p) => p.name === selectedParam);

  const latestHeight = readings.find((r) => r.paramName === 'Height (Inch)');
  const latestWeight = readings.find((r) => r.paramName === 'Weight (Kg)');
  let computedBmi = null;
  if (latestHeight && latestWeight) {
    const hMeters = parseFloat(latestHeight.value) * 0.0254;
    const wKg = parseFloat(latestWeight.value);
    if (hMeters > 0 && wKg > 0) {
      computedBmi = (wKg / (hMeters * hMeters)).toFixed(1);
    }
  }

  return (
    <div className="w-full space-y-6 font-sans">
      {/* Top Banner Card with Ambient Glow */}
      <div className="relative w-full bg-white rounded-[28px] border border-[#EFE5DB] p-6 sm:p-9 shadow-[0_4px_20px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-[#CAA067]/10 via-[#FAF3EC]/40 to-transparent rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-start justify-between gap-6">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2.5">
              <span className="h-[2px] w-7 bg-[#CAA067] rounded-full" />
              <span className="text-[11.5px] font-bold tracking-widest uppercase text-[#CAA067]">
                HEALTH METRICS & TELE-MONITORING
              </span>
            </div>
            <h1 className="text-[28px] sm:text-[34px] font-black text-[#2B434C] font-display tracking-tight leading-tight">
              Health Monitoring
            </h1>
            <p className="text-[13.5px] sm:text-[15px] text-[#64748B] font-medium leading-relaxed max-w-xl">
              Track and monitor your vital health parameters in one place for{' '}
              <strong className="text-[#2B434C] font-bold">{activePatient?.name || 'Active Patient'}</strong>.
              {computedBmi && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  ⚡ Computed BMI: {computedBmi}
                </span>
              )}
            </p>

            {/* Search Box */}
            <div className="pt-4 max-w-md w-full relative">
              <div className="relative flex items-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="#CAA067" strokeWidth="2.2" className="w-4 h-4 absolute left-4 pointer-events-none">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search health parameters (e.g. Blood pressure, Sugar)..."
                  className="w-full bg-[#FAF3EC]/40 border border-[#E9D5C2] rounded-2xl pl-11 pr-4 py-2.5 text-[13.5px] text-[#2B434C] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#CAA067]/40 focus:border-[#CAA067] transition-all font-medium"
                />
              </div>
            </div>

            {/* Parameter Tab Switcher */}
            <div className="pt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('VITAL_SIGNS')}
                className={`px-5 py-2.5 rounded-full text-[13px] font-bold transition-all duration-300 cursor-pointer flex items-center gap-2 ${
                  activeTab === 'VITAL_SIGNS'
                    ? 'bg-[#2B434C] text-white shadow-sm scale-102'
                    : 'bg-[#FAF3EC]/70 text-[#64748B] hover:text-[#2B434C] hover:bg-[#FAF3EC]'
                }`}
              >
                <span>Vital Signs</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-extrabold ${activeTab === 'VITAL_SIGNS' ? 'bg-white/20 text-white' : 'bg-[#E9D5C2] text-[#2B434C]'}`}>
                  {VITAL_SIGNS_LIST.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('LAB_PARAMETERS')}
                className={`px-5 py-2.5 rounded-full text-[13px] font-bold transition-all duration-300 cursor-pointer flex items-center gap-2 ${
                  activeTab === 'LAB_PARAMETERS'
                    ? 'bg-[#2B434C] text-white shadow-sm scale-102'
                    : 'bg-[#FAF3EC]/70 text-[#64748B] hover:text-[#2B434C] hover:bg-[#FAF3EC]'
                }`}
              >
                <span>Lab Parameters</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-extrabold ${activeTab === 'LAB_PARAMETERS' ? 'bg-white/20 text-white' : 'bg-[#E9D5C2] text-[#2B434C]'}`}>
                  {LAB_PARAMETERS_LIST.length}
                </span>
              </button>
            </div>
          </div>

          {/* + Add New Reading Button */}
          <button
            type="button"
            onClick={() => {
              setSelectedParam(activeTab === 'VITAL_SIGNS' ? VITAL_SIGNS_LIST[0].name : LAB_PARAMETERS_LIST[0].name);
              setValue('');
              setErrorMsg('');
              setShowModal(true);
            }}
            className="group bg-[#CAA067] hover:bg-[#B88F55] active:scale-[0.99] text-white px-6 py-3 rounded-2xl font-bold text-[14px] shadow-xs hover:shadow-md transition-all flex items-center gap-2.5 self-start cursor-pointer shrink-0"
          >
            <span className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-sm leading-none transition-transform group-hover:rotate-90">
              +
            </span>
            <span>Add New Reading</span>
          </button>
        </div>
      </div>

      {/* Parameter Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
        {filteredParams.map((param) => {
          const paramHistory = readings
            .filter((r) => r.paramName === param.name)
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          const latestReading = paramHistory[0];

          let isNormalStatus = true;
          if (latestReading && param.isNormal) {
            const num = parseFloat(latestReading.value);
            if (!isNaN(num)) isNormalStatus = param.isNormal(num);
          }

          return (
            <div
              key={param.key}
              className="group bg-white rounded-3xl border border-[#EDE2D5] p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.02)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.06)] hover:border-[#CAA067]/60 transition-all duration-300 flex flex-col justify-between space-y-4 relative overflow-hidden"
            >
              <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${param.gradient} rounded-bl-full pointer-events-none -mr-6 -mt-6 opacity-40 group-hover:opacity-100 transition-opacity duration-300`} />

              <div>
                {/* Top Row: Icon + Unit Pill */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#FAF3EC] border border-[#E9D5C2] flex items-center justify-center text-[#CAA067] shadow-2xs transition-all duration-300 group-hover:scale-110 group-hover:bg-white group-hover:shadow-xs">
                    <ParamIcon type={param.iconType} className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold text-[#CAA067] bg-[#FAF3EC] px-3 py-1 rounded-full border border-[#E9D5C2]/60 shadow-2xs">
                    {param.unit}
                  </span>
                </div>

                {/* Parameter Title */}
                <h3 className="font-bold text-[#2B434C] text-[14.5px] leading-snug group-hover:text-[#CAA067] transition-colors" title={param.name}>
                  {param.name}
                </h3>
                <p className="text-[11.5px] text-[#8B9EA8] font-medium mt-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#CAA067]" />
                  <span>Normal: {param.normalRange}</span>
                </p>
              </div>

              {/* Bottom Row: Reading Value, Clinical Status, & Actions */}
              <div className="pt-3.5 border-t border-[#F0E6DC] flex items-end justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">
                      Latest Value
                    </span>
                    {latestReading && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${isNormalStatus ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                        {isNormalStatus ? 'Normal' : 'Attention'}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-2xl font-black text-[#2B434C] tracking-tight">
                      {latestReading ? latestReading.value : '—'}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      {latestReading ? param.unit : ''}
                    </span>
                  </div>
                  
                  {latestReading ? (
                    <button
                      type="button"
                      onClick={() => setHistoryParam(param)}
                      className="text-[10.5px] text-[#CAA067] hover:underline font-semibold block mt-0.5 text-left cursor-pointer"
                    >
                      {latestReading.date} {latestReading.time ? `• ${latestReading.time}` : ''} ({paramHistory.length} logs)
                    </button>
                  ) : (
                    <span className="text-[10.5px] text-slate-400 font-medium block mt-0.5">
                      No logs recorded yet
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedParam(param.name);
                    setValue('');
                    setErrorMsg('');
                    setShowModal(true);
                  }}
                  className="text-xs font-bold text-white bg-[#CAA067] hover:bg-[#B88F55] active:scale-95 px-4 py-2 rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  <span className="text-sm leading-none">+</span>
                  <span>Log</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* History Modal for a Parameter */}
      <AnimatePresence>
        {historyParam && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white rounded-[28px] shadow-2xl max-w-lg w-full p-6 sm:p-8 space-y-5 border border-[#EDE2D5] max-h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-[#F0E6DC] pb-4">
                <div>
                  <h3 className="font-bold text-[#2B434C] text-lg font-display">{historyParam.name}</h3>
                  <p className="text-xs text-slate-500">History Log &middot; Unit: {historyParam.unit} &middot; Normal: {historyParam.normalRange}</p>
                </div>
                <button
                  onClick={() => setHistoryParam(null)}
                  className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {readings
                  .filter((r) => r.paramName === historyParam.name)
                  .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                  .map((log) => (
                    <div key={log.id} className="py-3 flex items-center justify-between text-sm">
                      <div>
                        <div className="font-bold text-[#2B434C] text-base">
                          {log.value} <span className="text-xs font-semibold text-slate-500">{log.unit}</span>
                        </div>
                        <div className="text-xs text-slate-400">
                          {log.date} {log.time ? `at ${log.time}` : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteReading(log.id)}
                        className="text-slate-400 hover:text-red-600 text-xs font-semibold px-2 py-1"
                        title="Delete reading"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
              </div>

              <div className="pt-3 border-t border-[#F0E6DC] flex justify-end">
                <button
                  onClick={() => setHistoryParam(null)}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add New Reading Modal - Enhanced Smooth Custom Floating Dropdown */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="bg-white rounded-[24px] shadow-2xl max-w-[390px] w-full p-6 sm:p-7 space-y-4 border border-[#EDE2D5]"
            >
              <h2 className="text-[20px] font-black text-[#2B434C] text-center font-display">
                Add New Reading
              </h2>

              {errorMsg && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 font-medium text-center">
                  ⚠️ {errorMsg}
                </div>
              )}

              <form onSubmit={saveReading} className="space-y-3.5">
                {/* 1. Custom Smooth Parameter Dropdown (Reduced Height & Compact) */}
                <div className="relative" ref={dropdownRef}>
                  <div
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="border border-[#3B5998] rounded-xl px-3.5 py-2 cursor-pointer bg-white relative transition-all hover:border-[#2F477A] focus-within:ring-2 focus-within:ring-[#3B5998]/20"
                  >
                    <span className="absolute -top-2.5 left-3 bg-white px-1.5 text-[11px] font-bold text-[#3B5998] leading-none select-none">
                      Parameter
                    </span>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className={`text-[13px] font-semibold truncate ${selectedParam ? 'text-[#2B434C]' : 'text-slate-400'}`}>
                        {selectedParam || 'Select parameter'}
                      </span>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#3B5998"
                        strokeWidth="2.3"
                        className={`w-4 h-4 transition-transform duration-200 shrink-0 ml-2 ${dropdownOpen ? 'rotate-180' : ''}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </div>

                  {/* Smooth Dropdown Menu with Compact Height max-h-48 (192px) */}
                  <AnimatePresence>
                    {dropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-[#D5E2F0] rounded-xl shadow-xl z-50 overflow-hidden"
                      >
                        <div className="max-h-44 overflow-y-auto p-1.5 space-y-1 divide-y divide-slate-100 scrollbar-thin">
                          {/* Vital Signs Group */}
                          <div className="pt-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B9EA8] px-2.5 py-1 block">
                              Vital Signs ({VITAL_SIGNS_LIST.length})
                            </span>
                            {VITAL_SIGNS_LIST.map((p) => (
                              <button
                                key={p.key}
                                type="button"
                                onClick={() => {
                                  setSelectedParam(p.name);
                                  setDropdownOpen(false);
                                  setErrorMsg('');
                                }}
                                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors flex items-center justify-between ${
                                  selectedParam === p.name
                                    ? 'bg-[#EBF2FA] text-[#3B5998] font-bold'
                                    : 'text-[#2B434C] hover:bg-[#FAF3EC]'
                                }`}
                              >
                                <span className="truncate">{p.name}</span>
                                <span className="text-[10px] text-[#CAA067] ml-2 shrink-0">{p.unit}</span>
                              </button>
                            ))}
                          </div>

                          {/* Lab Parameters Group */}
                          <div className="pt-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B9EA8] px-2.5 py-1 block">
                              Lab Parameters ({LAB_PARAMETERS_LIST.length})
                            </span>
                            {LAB_PARAMETERS_LIST.map((p) => (
                              <button
                                key={p.key}
                                type="button"
                                onClick={() => {
                                  setSelectedParam(p.name);
                                  setDropdownOpen(false);
                                  setErrorMsg('');
                                }}
                                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors flex items-center justify-between ${
                                  selectedParam === p.name
                                    ? 'bg-[#EBF2FA] text-[#3B5998] font-bold'
                                    : 'text-[#2B434C] hover:bg-[#FAF3EC]'
                                }`}
                              >
                                <span className="truncate">{p.name}</span>
                                <span className="text-[10px] text-[#CAA067] ml-2 shrink-0">{p.unit}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 2. Value Input */}
                <div>
                  <input
                    type="number"
                    step={activeParamDef?.step || 'any'}
                    min={activeParamDef?.min || 0}
                    max={activeParamDef?.max || 1000}
                    required
                    placeholder={activeParamDef ? `Value (${activeParamDef.unit})` : 'Value'}
                    value={value}
                    onChange={(e) => {
                      setValue(e.target.value);
                      setErrorMsg('');
                    }}
                    className="w-full border border-[#D5E2F0] rounded-xl px-3.5 py-2.5 text-[13.5px] text-[#2B434C] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#3B5998]/20 focus:border-[#3B5998] transition-all font-semibold"
                  />
                  {activeParamDef && (
                    <div className="text-[10.5px] text-[#8B9EA8] font-medium mt-1 px-1 flex justify-between">
                      <span>Normal: {activeParamDef.normalRange}</span>
                      <span>Unit: {activeParamDef.unit}</span>
                    </div>
                  )}
                </div>

                {/* 3. Date of Reading */}
                <div className="relative">
                  <fieldset className="border border-[#D5E2F0] rounded-xl px-3 pt-1 pb-2 focus-within:border-[#3B5998] transition-all">
                    <legend className="text-[10.5px] font-semibold text-[#8B9EA8] px-1">
                      Date of Reading
                    </legend>
                    <input
                      type="date"
                      required
                      value={readingDate}
                      onChange={(e) => setReadingDate(e.target.value)}
                      className="w-full bg-transparent text-[13px] font-bold text-[#2B434C] focus:outline-none cursor-pointer"
                    />
                  </fieldset>
                </div>

                {/* 4. Time of Reading (optional) */}
                <div className="relative">
                  <fieldset className="border border-[#D5E2F0] rounded-xl px-3 pt-1 pb-2 focus-within:border-[#3B5998] transition-all">
                    <legend className="text-[10.5px] font-semibold text-[#8B9EA8] px-1">
                      Time of Reading (optional)
                    </legend>
                    <input
                      type="time"
                      value={readingTime}
                      onChange={(e) => setReadingTime(e.target.value)}
                      className="w-full bg-transparent text-[13px] font-bold text-[#2B434C] focus:outline-none cursor-pointer"
                    />
                  </fieldset>
                </div>

                {/* Modal Buttons */}
                <div className="flex justify-end items-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setDropdownOpen(false);
                      setErrorMsg('');
                    }}
                    className="px-4 py-2 rounded-xl text-[13px] font-bold text-[#2B434C] border border-[#D5E2F0] hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-[#3B5998] hover:bg-[#2F477A] active:scale-95 text-white px-5 py-2 rounded-xl text-[13px] font-bold shadow-xs hover:shadow-md transition-all cursor-pointer"
                  >
                    Add Reading
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
