import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence, AnimatedNumber } from '../../components/motion';
import PrescriptionModal from '../../components/PrescriptionModal';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.02,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.35,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

const FEATURED_SPECIALITIES = [
  { id: 'gen', name: 'General Medicine', icon: '🩺', desc: 'Fever, cough, general health' },
  { id: 'cardio', name: 'Cardiology', icon: '🫀', desc: 'Heart care, BP & chest health' },
  { id: 'pedia', name: 'Pediatrics', icon: '👶', desc: 'Child health, care & growth' },
  { id: 'derma', name: 'Dermatology', icon: '🧴', desc: 'Skin, hair & allergy care' },
  { id: 'neuro', name: 'Neurology', icon: '🧠', desc: 'Headaches, nerve & brain care' },
  { id: 'ortho', name: 'Orthopedics', icon: '🦴', desc: 'Joints, bones & posture' },
  { id: 'gynae', name: 'Gynecology', icon: '🤰', desc: "Women's wellness & pregnancy" },
];

const JOIN_WINDOW_MINUTES_BEFORE = 15;
const JOIN_WINDOW_MINUTES_AFTER = 120; // 2 hours

function canJoinNow(slotStart) {
  if (!slotStart) return false;
  const now = Date.now();
  const start = new Date(slotStart).getTime();
  const opensAt = start - JOIN_WINDOW_MINUTES_BEFORE * 60 * 1000;
  const closesAt = start + JOIN_WINDOW_MINUTES_AFTER * 60 * 1000;
  return now >= opensAt && now <= closesAt;
}

function isMeetingExpired(slotStart) {
  if (!slotStart) return false;
  const closesAt = new Date(slotStart).getTime() + JOIN_WINDOW_MINUTES_AFTER * 60 * 1000;
  return Date.now() > closesAt;
}

function minutesUntil(slotStart) {
  return Math.round((new Date(slotStart).getTime() - Date.now()) / 60000);
}

function formatWhen(date) {
  const d = new Date(date);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today · ${time}`;
  if (isTomorrow) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · ${time}`;
}

export default function PatientDashboard() {
  const { activePatient, account } = useAuth();
  const [topDoctor, setTopDoctor] = useState(null);
  const [upcomingAppt, setUpcomingAppt] = useState(null);
  const [upcomingList, setUpcomingList] = useState([]);
  const [recentPrescriptions, setRecentPrescriptions] = useState([]);
  const [selectedPrescription, setSelectedPrescription] = useState(null);
  const [stats, setStats] = useState({ appointmentsCount: 0, doctorsCount: 14, prescriptionsCount: 0 });
  const [vitals, setVitals] = useState(null);
  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [vitalForm, setVitalForm] = useState({ bp: '120/80', spo2: '99', pulse: '74', temp: '98.6', sugar: '95' });
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);
  const navigate = useNavigate();

  // 30-second live update ticker for countdown / join window
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return { text: 'Good morning', icon: '🌅' };
    if (hour < 17) return { text: 'Good afternoon', icon: '☀️' };
    return { text: 'Good evening', icon: '🌙' };
  };

  const greeting = getGreeting();
  const patientDisplayName = activePatient?.name || (account?.mobile ? `Patient (${account.mobile.slice(-4)})` : 'Valued Patient');

  // Load vitals from storage
  const loadVitals = () => {
    if (!activePatient?.id) return;
    try {
      const stored = localStorage.getItem(`tuskmed_vitals_${activePatient.id}`);
      if (stored) {
        setVitals(JSON.parse(stored));
      } else {
        setVitals({
          bp: '120/80',
          spo2: '99',
          pulse: '72',
          temp: '98.6',
          sugar: '95',
          updatedAt: new Date().toISOString(),
        });
      }
    } catch {
      // fallback
    }
  };

  const saveVitals = (e) => {
    e.preventDefault();
    if (!activePatient?.id) return;
    const payload = { ...vitalForm, updatedAt: new Date().toISOString() };
    localStorage.setItem(`tuskmed_vitals_${activePatient.id}`, JSON.stringify(payload));
    setVitals(payload);
    setShowVitalsModal(false);
  };

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    loadVitals();

    Promise.all([
      api.get('/appointments/mine', { params: { scope: 'upcoming' } }).catch(() => ({ data: { appointments: [] } })),
      api.get('/appointments/mine', { params: { scope: 'past' } }).catch(() => ({ data: { appointments: [] } })),
      api.get('/doctors').catch(() => ({ data: { doctors: [] } })),
    ]).then(([upcomingRes, pastRes, docRes]) => {
      if (!isMounted) return;
      const upcoming = upcomingRes.data.appointments || [];
      const past = pastRes.data.appointments || [];
      const docs = docRes.data.doctors || [];

      setUpcomingList(upcoming);
      if (upcoming.length > 0) {
        setUpcomingAppt(upcoming[0]);
      } else {
        setUpcomingAppt(null);
      }

      const all = [...upcoming, ...past];
      const rxList = all.filter((a) => !!a.prescription);
      setRecentPrescriptions(rxList.slice(0, 4));

      setStats({
        appointmentsCount: past.length + upcoming.length,
        doctorsCount: Math.max(docs.length, 14),
        prescriptionsCount: rxList.length || (past.length > 0 ? 1 : 0),
      });

      if (past.length > 0 && past[0].doctor) {
        setTopDoctor(past[0].doctor);
      } else if (docs.length > 0) {
        setTopDoctor(docs[0]);
      } else {
        setTopDoctor(null);
      }
      setLoading(false);
    }).catch(() => {
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [activePatient]);

  const minsToUpcoming = upcomingAppt?.slot?.start ? minutesUntil(upcomingAppt.slot.start) : null;
  const isExpired = upcomingAppt?.slot?.start ? isMeetingExpired(upcomingAppt.slot.start) : false;
  const isJoinable = upcomingAppt?.slot?.start ? canJoinNow(upcomingAppt.slot.start) : false;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6 w-full max-w-6xl mx-auto pb-10"
    >
      {/* 1. Welcoming Header Banner */}
      <motion.div
        variants={itemVariants}
        className="rounded-3xl bg-gradient-to-r from-[#FAF3EC] via-[#FDF8F3] to-[#FAF1E6] border border-[#EEDCCB] p-6 sm:p-7 shadow-xs relative overflow-hidden"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-white/90 border border-[#EBE1D5] text-[11px] font-bold text-[#1B365D] uppercase tracking-wide">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>TuskMed Teleconsult Active</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B365D] tracking-tight font-display">
              {greeting.text}, <span className="text-[#CAA067] capitalize">{patientDisplayName}</span> {greeting.icon}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium">
              Consult verified specialists, manage health vitals, and access prescriptions securely.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-white/90 rounded-2xl border border-[#F0E5DA] px-4 py-2.5 text-center min-w-[90px] shadow-2xs">
              <div className="text-xl font-extrabold text-[#1B365D] font-display">
                <AnimatedNumber value={stats.appointmentsCount} />
              </div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Consults
              </div>
            </div>

            <div className="bg-white/90 rounded-2xl border border-[#F0E5DA] px-4 py-2.5 text-center min-w-[90px] shadow-2xs">
              <div className="text-xl font-extrabold text-[#CAA067] font-display">
                <AnimatedNumber value={stats.prescriptionsCount} />
              </div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Prescriptions
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 2. LIVE / UPCOMING CONSULTATION PROMINENT CARD */}
      {upcomingAppt && (
        <motion.div
          variants={itemVariants}
          className="rounded-3xl bg-gradient-to-r from-[#1B365D] via-[#152D4F] to-[#0E2038] text-white p-5 sm:p-6 shadow-lg border border-[#2D4D7A] relative overflow-hidden"
        >
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="h-13 w-13 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center font-black text-2xl shrink-0">
                {upcomingAppt.mode === 'VIDEO' ? '🎥' : '🏥'}
              </div>
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#E2C39B]">
                  <span className={`h-2.5 w-2.5 rounded-full ${isExpired ? 'bg-slate-400' : isJoinable ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
                  {isExpired
                    ? '⌛ Meeting Time Over (2h limit reached)'
                    : isJoinable
                    ? '🔴 Video Call Live / Ready to Join'
                    : `Upcoming Consultation ${minsToUpcoming > 0 && minsToUpcoming <= 60 ? `· in ${minsToUpcoming} mins` : ''}`}
                </div>
                <h3 className="text-xl font-bold font-display">
                  {upcomingAppt.doctor?.name}
                </h3>
                <p className="text-xs sm:text-sm text-slate-300">
                  {upcomingAppt.doctor?.speciality} &middot; {formatWhen(upcomingAppt.slot.start)} &middot; for{' '}
                  <span className="font-semibold text-white">{upcomingAppt.patient?.name}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 flex-wrap">
              <Link
                to={`/patient/appointments/${upcomingAppt.id}`}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/15 transition-colors"
              >
                View Details
              </Link>
              {upcomingAppt.mode === 'VIDEO' ? (
                isExpired ? (
                  <span className="px-4 py-2.5 rounded-xl bg-white/10 text-slate-300 text-xs font-bold border border-white/10">
                    Meeting Over (2h window expired)
                  </span>
                ) : (
                  <Link
                    to={`/consultation/${upcomingAppt.id}`}
                    className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all flex items-center gap-2 ${
                      isJoinable
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:brightness-110 ring-2 ring-emerald-300 ring-offset-2 ring-offset-[#1B365D] animate-pulse scale-105'
                        : 'bg-gradient-to-r from-[#CAA067] to-[#B88F55] text-white hover:brightness-105'
                    }`}
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                    </span>
                    {isJoinable ? '🎥 Join Video Call Now' : '🎥 Join Video Call (Opens 15m prior)'}
                  </Link>
                )
              ) : (
                <span className="px-4 py-2.5 rounded-xl bg-white/15 text-white text-xs font-bold">
                  In-Clinic Visit Confirmed
                </span>
              )}
            </div>
          </div>

          {upcomingList.length > 1 && (
            <div className="mt-3.5 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-300">
              <span>You have {upcomingList.length} total upcoming consultations booked.</span>
              <Link to="/patient/past-records" className="text-[#E2C39B] font-bold hover:underline">
                View All Consultations &rarr;
              </Link>
            </div>
          )}
        </motion.div>
      )}

      {/* 3. CORE QUICK ACTIONS (4 ESSENTIAL TILES) */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Action 1: Book Consultation */}
        <Link
          to="/patient/doctors"
          className="bg-white rounded-2xl p-4 sm:p-5 border border-[#F0E5DA] hover:border-[#CAA067] shadow-2xs hover:shadow-sm transition-all group flex flex-col justify-between space-y-3"
        >
          <div className="h-11 w-11 rounded-2xl bg-[#FAF3EC] text-[#CAA067] flex items-center justify-center text-xl transition-transform group-hover:scale-110">
            🩺
          </div>
          <div>
            <div className="font-extrabold text-slate-900 text-sm sm:text-base group-hover:text-[#CAA067] transition-colors">
              Book Appointment
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Consult verified specialists
            </div>
          </div>
        </Link>

        {/* Action 2: My Appointments */}
        <Link
          to="/patient/past-records"
          className="bg-white rounded-2xl p-4 sm:p-5 border border-[#F0E5DA] hover:border-[#CAA067] shadow-2xs hover:shadow-sm transition-all group flex flex-col justify-between space-y-3"
        >
          <div className="h-11 w-11 rounded-2xl bg-[#FAF3EC] text-[#CAA067] flex items-center justify-center text-xl transition-transform group-hover:scale-110">
            🗓️
          </div>
          <div>
            <div className="font-extrabold text-slate-900 text-sm sm:text-base group-hover:text-[#CAA067] transition-colors">
              My Appointments
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              View bookings &amp; join calls
            </div>
          </div>
        </Link>

        {/* Action 3: My Prescriptions */}
        <Link
          to="/patient/past-records"
          className="bg-white rounded-2xl p-4 sm:p-5 border border-[#F0E5DA] hover:border-[#CAA067] shadow-2xs hover:shadow-sm transition-all group flex flex-col justify-between space-y-3"
        >
          <div className="h-11 w-11 rounded-2xl bg-[#FAF3EC] text-[#CAA067] flex items-center justify-center text-xl transition-transform group-hover:scale-110">
            💊
          </div>
          <div>
            <div className="font-extrabold text-slate-900 text-sm sm:text-base group-hover:text-[#CAA067] transition-colors">
              My Prescriptions
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              View &amp; download digital Rx
            </div>
          </div>
        </Link>

        {/* Action 4: Medical Documents */}
        <Link
          to="/patient/upload-documents"
          className="bg-white rounded-2xl p-4 sm:p-5 border border-[#F0E5DA] hover:border-[#CAA067] shadow-2xs hover:shadow-sm transition-all group flex flex-col justify-between space-y-3"
        >
          <div className="h-11 w-11 rounded-2xl bg-[#FAF3EC] text-[#CAA067] flex items-center justify-center text-xl transition-transform group-hover:scale-110">
            📁
          </div>
          <div>
            <div className="font-extrabold text-slate-900 text-sm sm:text-base group-hover:text-[#CAA067] transition-colors">
              Medical Reports
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Upload lab scans &amp; records
            </div>
          </div>
        </Link>
      </motion.div>

      {/* 4. SPECIALTIES SELECTOR */}
      <motion.div variants={itemVariants} className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-4 w-1.5 rounded-full bg-[#CAA067]" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900 font-display">
              Find Doctors by Speciality
            </h2>
          </div>
          <Link to="/patient/doctors" className="text-xs font-bold text-[#CAA067] hover:underline">
            View All Doctors &rarr;
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {FEATURED_SPECIALITIES.map((spec) => (
            <Link
              key={spec.id}
              to="/patient/doctors"
              className="bg-white rounded-2xl p-3 border border-[#F0E5DA] hover:border-[#CAA067] shadow-2xs hover:shadow-xs flex flex-col items-center text-center gap-1.5 group transition-all"
            >
              <div className="text-2xl transition-transform group-hover:scale-110">{spec.icon}</div>
              <div className="text-[11px] font-bold text-slate-800 leading-tight group-hover:text-[#CAA067] transition-colors">
                {spec.name}
              </div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* 5. HEALTH VITALS & RECENT PRESCRIPTIONS SPLIT */}
      <div className="grid md:grid-cols-2 gap-5">
        {/* Left: Health Vitals Snapshot */}
        <motion.div variants={itemVariants} className="bg-white rounded-3xl p-5 border border-[#F0E5DA] shadow-2xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-lg">🫀</span>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base font-display">
                Health Vitals
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowVitalsModal(true)}
              className="text-xs font-bold text-[#CAA067] hover:underline cursor-pointer"
            >
              + Update Vitals
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* BP */}
            <div className="p-3 rounded-2xl bg-[#FAF3EC]/60 border border-[#F0E5DA] space-y-0.5">
              <div className="text-[10px] font-semibold text-slate-500 uppercase">Blood Pressure</div>
              <div className="text-base font-black text-slate-900 font-display">
                {vitals?.bp || '120/80'} <span className="text-[9px] text-slate-400 font-normal">mmHg</span>
              </div>
            </div>

            {/* SpO2 */}
            <div className="p-3 rounded-2xl bg-[#FAF3EC]/60 border border-[#F0E5DA] space-y-0.5">
              <div className="text-[10px] font-semibold text-slate-500 uppercase">Oxygen (SpO2)</div>
              <div className="text-base font-black text-slate-900 font-display">
                {vitals?.spo2 || '99'} <span className="text-[9px] text-slate-400 font-normal">%</span>
              </div>
            </div>

            {/* Pulse */}
            <div className="p-3 rounded-2xl bg-[#FAF3EC]/60 border border-[#F0E5DA] space-y-0.5">
              <div className="text-[10px] font-semibold text-slate-500 uppercase">Heart Rate</div>
              <div className="text-base font-black text-slate-900 font-display">
                {vitals?.pulse || '72'} <span className="text-[9px] text-slate-400 font-normal">bpm</span>
              </div>
            </div>

            {/* Sugar */}
            <div className="p-3 rounded-2xl bg-[#FAF3EC]/60 border border-[#F0E5DA] space-y-0.5">
              <div className="text-[10px] font-semibold text-slate-500 uppercase">Blood Sugar</div>
              <div className="text-base font-black text-slate-900 font-display">
                {vitals?.sugar || '95'} <span className="text-[9px] text-slate-400 font-normal">mg/dL</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Right: Recent Prescriptions */}
        <motion.div variants={itemVariants} className="bg-white rounded-3xl p-5 border border-[#F0E5DA] shadow-2xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-lg">💊</span>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base font-display">
                Recent Digital Prescriptions
              </h3>
            </div>
            <Link to="/patient/past-records" className="text-xs font-bold text-[#CAA067] hover:underline">
              View All &rarr;
            </Link>
          </div>

          {recentPrescriptions.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs space-y-1">
              <p>No prescriptions issued yet.</p>
              <p className="text-[11px] text-slate-400">Prescriptions appear here right after your consultation.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentPrescriptions.map((p) => (
                <div
                  key={p.id}
                  className="p-3 rounded-2xl bg-[#FAF3EC]/60 border border-[#F0E5DA] flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900">{p.doctor?.name}</div>
                    <div className="text-slate-500 text-[11px]">
                      {new Date(p.slot.start).toLocaleDateString()} &middot; {p.doctor?.speciality}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPrescription(p)}
                    className="px-3.5 py-1.5 rounded-xl bg-[#CAA067] text-white font-extrabold text-[11px] hover:bg-[#B88F55] transition-all shrink-0 cursor-pointer flex items-center gap-1.5"
                  >
                    <span>℞</span>
                    <span>View Prescription</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* QUICK LOG VITALS MODAL */}
      <AnimatePresence>
        {showVitalsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowVitalsModal(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="relative bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl z-10 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 text-lg font-display">
                  Update Health Vitals
                </h3>
                <button
                  type="button"
                  onClick={() => setShowVitalsModal(false)}
                  className="h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={saveVitals} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Blood Pressure</label>
                    <input
                      className="input text-sm"
                      placeholder="e.g. 120/80"
                      value={vitalForm.bp}
                      onChange={(e) => setVitalForm({ ...vitalForm, bp: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Heart Rate (bpm)</label>
                    <input
                      className="input text-sm"
                      placeholder="e.g. 72"
                      value={vitalForm.pulse}
                      onChange={(e) => setVitalForm({ ...vitalForm, pulse: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Oxygen SpO2 (%)</label>
                    <input
                      className="input text-sm"
                      placeholder="e.g. 99"
                      value={vitalForm.spo2}
                      onChange={(e) => setVitalForm({ ...vitalForm, spo2: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Blood Sugar (mg/dL)</label>
                    <input
                      className="input text-sm"
                      placeholder="e.g. 95"
                      value={vitalForm.sugar}
                      onChange={(e) => setVitalForm({ ...vitalForm, sugar: e.target.value })}
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowVitalsModal(false)}
                    className="btn-secondary text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary text-xs font-bold"
                  >
                    Save Vitals
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Standard Official Prescription Modal */}
      <PrescriptionModal
        isOpen={!!selectedPrescription}
        onClose={() => setSelectedPrescription(null)}
        appointment={selectedPrescription}
        patient={activePatient}
      />
    </motion.div>
  );
}
