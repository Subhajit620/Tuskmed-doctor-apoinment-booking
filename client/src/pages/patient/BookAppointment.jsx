import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../../api/client';
import { getSocket } from '../../api/socket';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence, AnimatedNumber } from '../../components/motion';

const MODES = [
  {
    value: 'VIDEO',
    title: 'Video Consultation',
    desc: 'Consult from home with encrypted HD video & digital Rx',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-5 h-5">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    ),
    badge: 'Fastest & Recommended',
  },
  {
    value: 'IN_CLINIC',
    title: 'In-Clinic Visit',
    desc: 'Meet the doctor in person at our affiliated clinic',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-5 h-5">
        <path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16" />
        <path d="M3 21h18" />
        <path d="M9 7h1" />
        <path d="M9 11h1" />
        <path d="M14 7h1" />
        <path d="M14 11h1" />
      </svg>
    ),
    badge: 'Physical Examination',
  },
];

const QUICK_SYMPTOM_TAGS = [
  { label: '🤒 Fever & Flu', category: 'General Medicine' },
  { label: '🧴 Skin Rash / Acne', category: 'Dermatology' },
  { label: '🫀 Chest / Heart', category: 'Cardiology' },
  { label: '🤢 Stomach & Acidity', category: 'Gastroenterology' },
  { label: '🤕 Headache & Migraine', category: 'Neurology' },
  { label: '🤧 Cough & Cold', category: 'General Medicine' },
  { label: '👶 Child Healthcare', category: 'Pediatrics' },
  { label: '📋 Routine Follow-up', category: 'Follow-up' },
];

const SUGGESTED_PROMOS = [
  { code: 'WELCOME10', discount: '10% OFF', desc: 'Welcome bonus for your consultation' },
  { code: 'FLAT100', discount: 'FLAT ₹100 OFF', desc: 'Special teleconsultation savings' },
];

function getNextDays(count = 14) {
  const days = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' });
    const monthName = d.toLocaleDateString('en-US', { month: 'short' });
    const dayNum = d.getDate();
    days.push({ dateStr, dayName, monthName, dayNum, fullDate: d });
  }
  return days;
}

function categorizeSlots(slots) {
  const morning = [];
  const afternoon = [];
  const evening = [];

  slots.forEach((s) => {
    const d = new Date(s.start);
    const hour = d.getHours();
    if (hour < 12) {
      morning.push(s);
    } else if (hour < 17) {
      afternoon.push(s);
    } else {
      evening.push(s);
    }
  });

  return { morning, afternoon, evening };
}

export default function BookAppointment() {
  const location = useLocation();
  const state = location.state;
  const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const initialDoctorId = state?.doctorId || queryParams.get('doctorId') || '';
  const initialSpecialityId = state?.specialityId || queryParams.get('specialityId') || '';
  const initialMode = state?.mode || queryParams.get('mode') || 'VIDEO';

  const navigate = useNavigate();
  const { activePatient, loading: authLoading } = useAuth();

  const nextDays = useMemo(() => getNextDays(14), []);

  const [step, setStep] = useState(1);
  const [specialities, setSpecialities] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Step 1: Selection states
  const [date, setDate] = useState(nextDays[0]?.dateStr || '');
  const [specialityId, setSpecialityId] = useState(initialSpecialityId);
  const [doctorId, setDoctorId] = useState(initialDoctorId);
  const [mode, setMode] = useState(initialMode);
  const [slotId, setSlotId] = useState('');

  // Step 2: Problem & Documents
  const [symptoms, setSymptoms] = useState('');
  const [category, setCategory] = useState('');
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');

  // Step 3: Checkout & Payment
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState('');
  const [promoState, setPromoState] = useState(null); // null | valid | invalid | expired
  const [feeInfo, setFeeInfo] = useState(null);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(null);

  // Load specialities
  useEffect(() => {
    api.get('/specialities').then((res) => setSpecialities(res.data.specialities || [])).catch(() => {});
  }, []);

  // Load all doctors or filtered by speciality
  useEffect(() => {
    api
      .get('/doctors', { params: { specialityId: specialityId || undefined } })
      .then((res) => {
        const docs = res.data.doctors || [];
        setDoctors(docs);
        const targetId = initialDoctorId || doctorId;
        if (targetId && docs.some((d) => d.id === targetId)) {
          setDoctorId(targetId);
        } else if (docs.length > 0 && !doctorId) {
          setDoctorId(docs[0].id);
        }
      })
      .catch(() => {
        setDoctors([]);
      });
  }, [specialityId, initialDoctorId]);

  // If specific doctorId requested from outer page, ensure doctor details are fetched
  useEffect(() => {
    if (initialDoctorId) {
      api
        .get('/doctors')
        .then((res) => {
          const allDocs = res.data.doctors || [];
          const match = allDocs.find((d) => d.id === initialDoctorId);
          if (match) {
            setDoctorId(match.id);
            if (match.specialityId && !specialityId) {
              setSpecialityId(match.specialityId);
            }
          }
        })
        .catch(() => {});
    }
  }, [initialDoctorId]);

  const selectedDoctor = useMemo(() => doctors.find((d) => d.id === doctorId), [doctors, doctorId]);
  const selectedSlot = useMemo(() => slots.find((s) => s.id === slotId), [slots, slotId]);

  // Fetch available slots
  useEffect(() => {
    setSlotId('');
    setSlots([]);
    if (!date || !doctorId || !mode) return;
    setSlotsLoading(true);
    api
      .get(`/doctors/${doctorId}/slots`, { params: { date, mode } })
      .then((res) => setSlots(res.data.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [date, doctorId, mode]);

  // Real-time slot availability updates via Socket.IO
  useEffect(() => {
    if (!date || !doctorId) return undefined;
    const socket = getSocket();
    socket.emit('slots:subscribe', { doctorId, date });
    const onUpdate = ({ slotId: updatedId, status }) => {
      if (status === 'AVAILABLE') {
        // Refetch to get fresh slots details
        api.get(`/doctors/${doctorId}/slots`, { params: { date, mode } }).then((res) => setSlots(res.data.slots || []));
        return;
      }
      setSlots((prev) => prev.filter((s) => s.id !== updatedId));
      setSlotId((prev) => (prev === updatedId ? '' : prev));
    };
    socket.on('slot:update', onUpdate);
    return () => {
      socket.emit('slots:unsubscribe', { doctorId, date });
      socket.off('slot:update', onUpdate);
    };
  }, [date, doctorId, mode]);

  // Fetch fee breakdown & promo code calculation
  useEffect(() => {
    if (!doctorId) {
      setFeeInfo(null);
      return;
    }
    api
      .get('/appointments/promo/preview', { params: { doctorId, mode, code: appliedPromo || undefined } })
      .then((res) => {
        setFeeInfo(res.data);
        setPromoState(appliedPromo ? res.data.state : null);
      })
      .catch(() => setFeeInfo(null));
  }, [doctorId, mode, appliedPromo]);

  const handleApplyPromo = (codeToApply) => {
    const code = (codeToApply || promoCode).trim().toUpperCase();
    if (!code) return;
    setPromoCode(code);
    setAppliedPromo(code);
  };

  const handleRemovePromo = () => {
    setPromoCode('');
    setAppliedPromo('');
    setPromoState(null);
  };

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    setFileError('');
    if (f && f.size > 4 * 1024 * 1024) {
      setFileError('Medical document must be under 4 MB');
      setFile(null);
      return;
    }
    setFile(f || null);
  };

  const categorizedSlots = useMemo(() => categorizeSlots(slots), [slots]);

  const step1Complete = date && doctorId && mode && slotId;
  const step2Complete = symptoms.trim().length >= 3;
  const canBook = step1Complete && step2Complete && !fileError && !busy;

  const submitBooking = async () => {
    setError('');
    setBusy(true);
    try {
      const bookRes = await api.post('/appointments/book', {
        doctorId,
        slotId,
        mode,
        symptoms: symptoms.trim(),
        category: category || undefined,
        promoCode: promoState === 'valid' ? appliedPromo : undefined,
      });
      const { appointmentId, order } = bookRes.data;

      if (file) {
        const form = new FormData();
        form.append('file', file);
        await api.post(`/appointments/${appointmentId}/documents`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }).catch(() => {});
      }

      // Complete payment confirmation
      await api.post(`/appointments/${appointmentId}/confirm-payment`, {
        gatewayPaymentId: `pay_${Date.now()}`,
        gatewayOrderId: order.id,
        mockOutcome: 'success',
      });

      setBookingSuccess({
        appointmentId,
        doctor: selectedDoctor,
        slot: selectedSlot,
        date,
        mode,
      });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) {
    return (
      <div className="max-w-2xl mx-auto rounded-3xl bg-[#FAF3EC] border border-[#F0E5DA] p-12 text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 border-4 border-[#CAA067] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-slate-600 text-sm font-medium">Loading booking portal...</p>
      </div>
    );
  }

  if (!activePatient) {
    return (
      <div className="max-w-2xl mx-auto rounded-3xl bg-[#FAF3EC] border border-[#F0E5DA] p-8 text-center space-y-4 shadow-sm">
        <div className="w-16 h-16 rounded-full bg-[#CAA067]/15 text-[#CAA067] flex items-center justify-center mx-auto text-2xl font-bold">
          👤
        </div>
        <h2 className="text-2xl font-bold text-[#1B365D] font-display">No Active Patient Profile</h2>
        <p className="text-slate-600 max-w-md mx-auto text-sm leading-relaxed">
          Please add or select a patient profile before booking an appointment.
        </p>
        <Link
          to="/patient/register-patient"
          className="inline-block bg-[#CAA067] hover:bg-[#B88F55] text-white font-bold px-6 py-3 rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          Add Patient Profile
        </Link>
      </div>
    );
  }

  // Success Confirmation View
  if (bookingSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-2xl mx-auto rounded-[32px] bg-white border border-[#F0E5DA] p-8 sm:p-10 text-center space-y-6 shadow-xl"
      >
        <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-10 h-10">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <div className="space-y-2">
          <span className="inline-block px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold uppercase tracking-wider">
            Booking Confirmed &amp; Paid
          </span>
          <h2 className="text-3xl font-black text-[#1B365D] font-display">Appointment Scheduled!</h2>
          <p className="text-slate-600 text-sm max-w-md mx-auto">
            Your appointment with <strong className="text-slate-900">{bookingSuccess.doctor?.name}</strong> is confirmed. A WhatsApp confirmation has been dispatched.
          </p>
        </div>

        {/* Appointment Card Recap */}
        <div className="bg-[#FAF3EC] border border-[#F0E5DA] rounded-2xl p-5 text-left space-y-3">
          <div className="flex items-center justify-between border-b border-[#E8DACB] pb-3">
            <span className="text-xs font-bold text-slate-500 uppercase">Consultation Type</span>
            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white text-[#1B365D] border border-[#E8DACB]">
              {bookingSuccess.mode === 'VIDEO' ? '📹 Video Consultation' : '🏥 In-Clinic Visit'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-slate-500 font-medium">Doctor</div>
              <div className="font-bold text-slate-900">{bookingSuccess.doctor?.name}</div>
              <div className="text-xs text-[#CAA067] font-semibold">{bookingSuccess.doctor?.speciality}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium">Date &amp; Time</div>
              <div className="font-bold text-slate-900">
                {new Date(bookingSuccess.slot?.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
              <div className="text-xs text-slate-600 font-semibold">
                {new Date(bookingSuccess.slot?.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={() => navigate('/patient/appointments')}
            className="flex-1 bg-[#CAA067] hover:bg-[#B88F55] text-white py-3.5 px-6 rounded-xl font-bold shadow-xs transition-colors cursor-pointer"
          >
            Go to My Appointments
          </button>
          <button
            onClick={() => {
              setBookingSuccess(null);
              setStep(1);
              setSymptoms('');
              setFile(null);
            }}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3.5 px-6 rounded-xl font-bold transition-colors cursor-pointer"
          >
            Book Another Visit
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Title & Patient Context Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#1B365D] font-display tracking-tight">
            Book an Appointment
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Select specialist, choose your preferred slot, and confirm instant consultation.
          </p>
        </div>

        {/* Active Patient Capsule */}
        <div className="inline-flex items-center gap-2.5 bg-[#FAF3EC] border border-[#F0E5DA] px-4 py-2 rounded-2xl shadow-2xs self-start sm:self-auto">
          <div className="w-8 h-8 rounded-xl bg-[#CAA067] text-white flex items-center justify-center font-bold text-xs">
            {activePatient?.name?.[0]?.toUpperCase() || 'P'}
          </div>
          <div className="text-left">
            <div className="text-[10px] uppercase font-bold text-slate-400 leading-none">Consulting For</div>
            <div className="text-xs font-extrabold text-[#1B365D] leading-tight capitalize mt-0.5">
              {activePatient?.name || 'Patient'}
            </div>
          </div>
          <Link
            to="/patient/change-patient"
            className="text-[11px] text-[#CAA067] hover:underline font-bold ml-1"
          >
            Switch
          </Link>
        </div>
      </div>

      {/* Progress Steps Header */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { num: 1, title: 'Doctor & Slot', desc: 'Select specialist & time' },
          { num: 2, title: 'Health Problem', desc: 'Symptoms & documents' },
          { num: 3, title: 'Checkout & Pay', desc: 'Review & confirmation' },
        ].map((s) => {
          const isCurrent = step === s.num;
          const isDone = step > s.num;
          return (
            <button
              key={s.num}
              type="button"
              onClick={() => {
                if (s.num === 1) setStep(1);
                else if (s.num === 2 && step1Complete) setStep(2);
              }}
              className={`p-3 sm:p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${
                isCurrent
                  ? 'bg-[#FAF3EC] border-[#CAA067] shadow-xs'
                  : isDone
                  ? 'bg-white border-emerald-200 hover:border-emerald-300'
                  : 'bg-white/60 border-slate-200 opacity-60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                    isDone
                      ? 'bg-emerald-500 text-white'
                      : isCurrent
                      ? 'bg-[#CAA067] text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {isDone ? '✓' : s.num}
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-extrabold text-[#1B365D] truncate">{s.title}</div>
                  <div className="text-[11px] text-slate-500 hidden sm:block truncate">{s.desc}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Error Callout */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 font-medium flex items-center gap-2"
          >
            <span>⚠️</span>
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* STEP 1: DOCTOR & LIVE TIME SLOT                                            */}
      {/* ========================================================================= */}
      {step === 1 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="space-y-6"
        >
          {/* Consultation Mode Switcher */}
          <div className="card space-y-3">
            <label className="text-sm font-bold text-[#1B365D] flex items-center gap-1.5">
              <span>1. Choose Consultation Mode</span>
            </label>
            <div className="grid sm:grid-cols-2 gap-3.5">
              {MODES.map((m) => {
                const isSelected = mode === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMode(m.value)}
                    className={`p-4 rounded-2xl border-2 text-left transition-all flex items-start gap-3.5 cursor-pointer relative ${
                      isSelected
                        ? 'border-[#CAA067] bg-[#FAF3EC] shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div
                      className={`p-2.5 rounded-xl shrink-0 ${
                        isSelected ? 'bg-[#CAA067] text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {m.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-sm sm:text-base text-[#1B365D]">{m.title}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-[#E8DACB] text-[#CAA067]">
                          {m.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{m.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Speciality Filter Pills */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-[#1B365D]">2. Select Medical Speciality</label>
              <span className="text-xs text-slate-400 font-medium">Filter doctors</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
              <button
                type="button"
                onClick={() => setSpecialityId('')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  specialityId === ''
                    ? 'bg-[#1B365D] text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                🩺 All Specialities
              </button>
              {specialities.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSpecialityId(s.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    specialityId === s.id
                      ? 'bg-[#CAA067] text-white shadow-2xs'
                      : 'bg-[#FAF3EC] text-[#1B365D] border border-[#F0E5DA] hover:bg-[#F2E5D8]'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* Doctor Selection Cards */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-[#1B365D]">3. Choose Specialist Doctor *</label>
              <span className="text-xs text-slate-500 font-medium">
                {doctors.length} {doctors.length === 1 ? 'Doctor' : 'Doctors'} Available
              </span>
            </div>

            {doctors.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No doctors found for this speciality.</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {doctors.map((d) => {
                  const isSelected = doctorId === d.id;
                  const feeToDisplay = mode === 'IN_CLINIC' ? d.clinicFee || d.fee : d.fee;
                  const nextSlot = d.nextAvailableSlot;

                  const handleSelectNextSlot = (e, slot) => {
                    e.stopPropagation();
                    setDoctorId(d.id);
                    if (slot.mode) setMode(slot.mode);
                    const slotDate = new Date(slot.start);
                    const dateStr = `${slotDate.getFullYear()}-${String(slotDate.getMonth() + 1).padStart(2, '0')}-${String(slotDate.getDate()).padStart(2, '0')}`;
                    setDate(dateStr);
                    setSlotId(slot.id);
                  };

                  return (
                    <div
                      key={d.id}
                      onClick={() => setDoctorId(d.id)}
                      className={`p-4 rounded-2xl border-2 text-left cursor-pointer transition-all relative flex flex-col justify-between ${
                        isSelected
                          ? 'border-[#CAA067] bg-[#FAF3EC] shadow-sm ring-2 ring-[#CAA067]/20'
                          : 'border-slate-200 hover:border-[#CAA067]/50 bg-white'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-[#FAF3EC] to-white border border-[#E8DACB] flex items-center justify-center font-bold text-sm text-[#1B365D] shadow-2xs">
                              👨‍⚕️
                            </div>
                            <div>
                              <div className="font-extrabold text-sm text-[#1B365D] leading-tight line-clamp-1">{d.name}</div>
                              <div className="text-xs text-[#CAA067] font-semibold">{d.speciality}</div>
                            </div>
                          </div>
                          <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-lg shrink-0">
                            ★ {d.rating || '4.9'}
                          </span>
                        </div>

                        <div className="text-[11.5px] text-slate-500 space-y-0.5 pt-1 border-t border-slate-100">
                          <div>⏳ {d.experienceYrs || '10+'} yrs experience</div>
                          <div>🗣️ {(d.languages || []).slice(0, 2).join(', ') || 'English, Hindi'}</div>
                        </div>

                        {nextSlot && (
                          <button
                            type="button"
                            onClick={(e) => handleSelectNextSlot(e, nextSlot)}
                            className="w-full mt-1.5 py-1.5 px-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-[11px] font-bold flex items-center justify-between transition-colors"
                          >
                            <span>⚡ Next Available</span>
                            <span>{new Date(nextSlot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-100/80">
                        <span className="text-xs text-slate-500">Consultation Fee</span>
                        <span className="text-sm font-black text-slate-900 font-display">
                          ₹{Number(feeToDisplay || 0).toFixed(0)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 14-Day Date Strip Picker */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-[#1B365D]">4. Select Consultation Date *</label>
              <input
                type="date"
                min={nextDays[0]?.dateStr}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 focus:outline-none"
              />
            </div>

            <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
              {nextDays.map((d) => {
                const isSelected = date === d.dateStr;
                return (
                  <button
                    key={d.dateStr}
                    type="button"
                    onClick={() => setDate(d.dateStr)}
                    className={`py-3 px-3.5 rounded-2xl border-2 text-center transition-all shrink-0 cursor-pointer min-w-[76px] ${
                      isSelected
                        ? 'bg-[#CAA067] border-[#CAA067] text-white shadow-xs scale-[1.02]'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wider opacity-90">{d.dayName}</div>
                    <div className="text-lg font-black my-0.5">{d.dayNum}</div>
                    <div className="text-[10px] font-semibold opacity-80">{d.monthName}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time Categorized Slot Grid */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-[#1B365D]">5. Select Available Time Slot *</label>
              {slots.length > 0 && (
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  ● {slots.length} Slots Available
                </span>
              )}
            </div>

            {!doctorId ? (
              <p className="text-sm text-slate-400 py-4 text-center">Please select a doctor to load available time slots.</p>
            ) : slotsLoading ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-8 h-8 border-3 border-[#CAA067] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-500 font-medium">Checking live doctor availability...</p>
              </div>
            ) : slots.length === 0 ? (
              <div className="bg-[#FAF3EC] border border-[#F0E5DA] rounded-2xl p-6 text-center space-y-3">
                <p className="text-sm font-bold text-slate-700">No time slots available on this selected date.</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  The doctor might be fully booked or off on this date. You can select another date from the strip above.
                </p>
                {selectedDoctor?.nextAvailableSlot ? (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        const slot = selectedDoctor.nextAvailableSlot;
                        if (slot.mode) setMode(slot.mode);
                        const slotDate = new Date(slot.start);
                        const dateStr = `${slotDate.getFullYear()}-${String(slotDate.getMonth() + 1).padStart(2, '0')}-${String(slotDate.getDate()).padStart(2, '0')}`;
                        setDate(dateStr);
                        setSlotId(slot.id);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <span>⚡ Jump to Next Available Slot (
                        {new Date(selectedDoctor.nextAvailableSlot.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at {new Date(selectedDoctor.nextAvailableSlot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      )</span>
                      <span>→</span>
                    </button>
                  </div>
                ) : nextDays[1] ? (
                  <button
                    type="button"
                    onClick={() => setDate(nextDays[1].dateStr)}
                    className="bg-[#CAA067] hover:bg-[#B88F55] text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors inline-block cursor-pointer"
                  >
                    Check Tomorrow&apos;s Availability →
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Morning Slots */}
                {categorizedSlots.morning.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <span>🌅</span> <span>Morning (08:00 AM – 12:00 PM)</span>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {categorizedSlots.morning.map((s) => {
                        const isSelected = slotId === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSlotId(s.id)}
                            className={`px-4 py-2.5 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[#CAA067] border-[#CAA067] text-white shadow-xs'
                                : 'bg-white border-slate-200 hover:border-[#CAA067] text-slate-800'
                            }`}
                          >
                            {new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Afternoon Slots */}
                {categorizedSlots.afternoon.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <span>☀️</span> <span>Afternoon (12:00 PM – 05:00 PM)</span>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {categorizedSlots.afternoon.map((s) => {
                        const isSelected = slotId === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSlotId(s.id)}
                            className={`px-4 py-2.5 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[#CAA067] border-[#CAA067] text-white shadow-xs'
                                : 'bg-white border-slate-200 hover:border-[#CAA067] text-slate-800'
                            }`}
                          >
                            {new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Evening Slots */}
                {categorizedSlots.evening.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <span>🌙</span> <span>Evening (05:00 PM – 09:00 PM)</span>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {categorizedSlots.evening.map((s) => {
                        const isSelected = slotId === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSlotId(s.id)}
                            className={`px-4 py-2.5 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[#CAA067] border-[#CAA067] text-white shadow-xs'
                                : 'bg-white border-slate-200 hover:border-[#CAA067] text-slate-800'
                            }`}
                          >
                            {new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Continue Action Button */}
          <div className="flex items-center justify-between pt-2">
            <div>
              {selectedDoctor && selectedSlot && (
                <p className="text-sm text-slate-600 font-medium">
                  Selected: <strong className="text-slate-900">{selectedDoctor?.name}</strong> at{' '}
                  <strong className="text-[#CAA067]">
                    {selectedSlot?.start && new Date(selectedSlot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </strong>
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={!step1Complete}
              onClick={() => setStep(2)}
              className="bg-[#CAA067] hover:bg-[#B88F55] disabled:opacity-50 text-white font-bold px-8 py-3.5 rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-2"
            >
              <span>Next: Health Details</span>
              <span>→</span>
            </button>
          </div>
        </motion.div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: HEALTH PROBLEM & DOCUMENTS                                        */}
      {/* ========================================================================= */}
      {step === 2 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="space-y-6"
        >
          <div className="card space-y-5">
            {/* Quick Category Suggestion Tags */}
            <div className="space-y-2.5">
              <label className="text-sm font-bold text-[#1B365D]">Quick Problem Categories (Optional)</label>
              <div className="flex flex-wrap gap-2">
                {QUICK_SYMPTOM_TAGS.map((t) => {
                  const isSelected = category === t.category;
                  return (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => setCategory(isSelected ? '' : t.category)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#CAA067] border-[#CAA067] text-white shadow-2xs'
                          : 'bg-[#FAF3EC] border-[#F0E5DA] text-slate-700 hover:bg-[#F2E5D8]'
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Problem Category Input */}
            <div>
              <label className="label">Problem Category / Title</label>
              <input
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Acute Fever, Skin Allergy, General Checkup"
              />
            </div>

            {/* Describe Problem */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label !mb-0">Describe your symptoms &amp; health concerns *</label>
                <span className="text-xs text-slate-400 font-medium">{symptoms.length}/500</span>
              </div>
              <textarea
                className="input"
                rows={4}
                maxLength={500}
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="Please describe symptoms, when they started, severity, and any ongoing medications..."
              />
            </div>

            {/* File Upload Area */}
            <div>
              <label className="label">Attach Medical Reports / Lab Test Scans (Optional, &lt; 4 MB)</label>
              <div className="rounded-2xl border-2 border-dashed border-[#E8DACB] bg-[#FAF3EC]/50 p-6 text-center hover:bg-[#FAF3EC] transition-colors relative">
                <input
                  type="file"
                  onChange={onFileChange}
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-full bg-white border border-[#E8DACB] text-[#CAA067] flex items-center justify-center mx-auto text-lg shadow-2xs">
                    📁
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-[#1B365D]">
                    {file ? (
                      <span className="text-emerald-700 font-extrabold">Attached: {file.name} ({(file.size / 1024).toFixed(0)} KB)</span>
                    ) : (
                      'Click or drag PDF, JPG, or PNG files here'
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">Supports PDF, PNG, JPG up to 4MB</p>
                </div>
              </div>
              {fileError && <p className="text-xs text-red-600 mt-1.5 font-medium">{fileError}</p>}
            </div>
          </div>

          {/* Navigation Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="btn-secondary flex-1 py-3"
            >
              ← Back: Doctor &amp; Slot
            </button>
            <button
              type="button"
              disabled={!step2Complete || !!fileError}
              onClick={() => setStep(3)}
              className="btn-primary flex-1 py-3"
            >
              Next: Review &amp; Checkout →
            </button>
          </div>
        </motion.div>
      )}

      {/* ========================================================================= */}
      {/* STEP 3: REVIEW, PROMO CODES & CHECKOUT                                     */}
      {/* ========================================================================= */}
      {step === 3 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="space-y-6"
        >
          {/* Appointment Recap Card */}
          <div className="card space-y-4">
            <h2 className="text-base font-extrabold text-[#1B365D] border-b border-slate-100 pb-3 flex items-center justify-between">
              <span>Appointment Summary</span>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#FAF3EC] text-[#CAA067] border border-[#F0E5DA]">
                {mode === 'VIDEO' ? '📹 Video Consult' : '🏥 In-Clinic Visit'}
              </span>
            </h2>

            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
                <div className="text-xs font-bold text-slate-400 uppercase">Specialist Doctor</div>
                <div className="font-extrabold text-[#1B365D] text-base">{selectedDoctor?.name}</div>
                <div className="text-xs text-[#CAA067] font-semibold">{selectedDoctor?.speciality}</div>
                <div className="text-xs text-slate-500">Reg No: {selectedDoctor?.registrationNo || 'Verified'}</div>
              </div>

              <div className="space-y-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
                <div className="text-xs font-bold text-slate-400 uppercase">Consultation Timing</div>
                <div className="font-extrabold text-slate-900 text-base">
                  {selectedSlot && new Date(selectedSlot.start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div className="text-sm font-bold text-[#CAA067]">
                  {selectedSlot && new Date(selectedSlot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="text-xs text-slate-500">Patient: {activePatient?.name || 'Patient'}</div>
              </div>
            </div>

            {symptoms && (
              <div className="bg-[#FAF3EC]/60 border border-[#F0E5DA] rounded-xl p-3.5 text-xs text-slate-700">
                <span className="font-bold text-slate-900">Symptoms noted: </span>
                <span>{symptoms}</span>
              </div>
            )}
          </div>

          {/* Promo Code Voucher Box */}
          <div className="card space-y-4">
            <label className="text-sm font-bold text-[#1B365D]">Have a Promo Code?</label>

            <div className="flex gap-2.5">
              <input
                className="input flex-1 uppercase font-bold tracking-wider"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                placeholder="Enter promo code (e.g. WELCOME10)"
              />
              {appliedPromo ? (
                <button
                  type="button"
                  onClick={handleRemovePromo}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                >
                  Remove
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleApplyPromo()}
                  disabled={!promoCode.trim()}
                  className="px-5 py-2 rounded-xl bg-[#1B365D] hover:bg-[#023165] disabled:opacity-50 text-white text-xs font-bold transition-colors"
                >
                  Apply
                </button>
              )}
            </div>

            {/* Promo Status Feedback */}
            {promoState === 'valid' && (
              <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2 flex items-center justify-between">
                <span>✓ Promo code &apos;{appliedPromo}&apos; applied successfully!</span>
                <span>Saved ₹{Number(feeInfo?.discountAmount || 0).toFixed(0)}</span>
              </div>
            )}
            {promoState === 'invalid' && (
              <p className="text-xs font-semibold text-red-600">This promo code is invalid or not applicable.</p>
            )}
            {promoState === 'expired' && (
              <p className="text-xs font-semibold text-red-600">This promo code has expired.</p>
            )}

            {/* Available Suggested Coupons */}
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <span className="text-xs text-slate-400 font-medium">Available Coupons for you:</span>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {SUGGESTED_PROMOS.map((sp) => (
                  <div
                    key={sp.code}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-dashed border-[#E8DACB] bg-[#FAF3EC]/40"
                  >
                    <div>
                      <div className="text-xs font-black text-[#1B365D] tracking-wider">{sp.code}</div>
                      <div className="text-[10.5px] text-slate-500">{sp.desc}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApplyPromo(sp.code)}
                      className="text-xs font-bold text-[#CAA067] hover:underline"
                    >
                      Apply
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Transparent Price Breakdown */}
          {feeInfo && (
            <div className="card space-y-3 bg-gradient-to-br from-[#FAF3EC] to-white border-[#F0E5DA]">
              <h3 className="text-sm font-extrabold text-[#1B365D]">Payment Breakdown</h3>
              <div className="space-y-2 text-sm text-slate-600">
                <div className="flex justify-between">
                  <span>Doctor Consultation Fee</span>
                  <span className="font-bold text-slate-900">₹{Number(feeInfo.fee || 0).toFixed(2)}</span>
                </div>
                {feeInfo.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>Promo Discount ({appliedPromo})</span>
                    <span>- ₹{Number(feeInfo.discountAmount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-500 text-xs">
                  <span>Platform &amp; Service Fee</span>
                  <span className="text-emerald-700 font-bold">FREE</span>
                </div>
                <div className="flex justify-between font-black text-lg text-[#1B365D] border-t border-[#E8DACB] pt-2 mt-1">
                  <span>Total Payable</span>
                  <span className="text-[#CAA067]">₹{Number(feeInfo.finalAmount || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Secure Checkout Actions */}
          <div className="space-y-3 pt-2">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-secondary flex-1 py-3.5"
              >
                ← Back
              </button>
              <button
                type="button"
                disabled={!canBook}
                onClick={submitBooking}
                className="btn-primary flex-2 py-3.5 text-base font-bold shadow-md cursor-pointer flex items-center justify-center gap-2"
              >
                {busy ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Confirming Appointment...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm &amp; Book Appointment</span>
                    <span>🔒</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-center text-[11px] text-slate-400 font-medium">
              🔒 256-Bit SSL Encrypted &amp; HIPAA Compliant Teleconsultation
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

