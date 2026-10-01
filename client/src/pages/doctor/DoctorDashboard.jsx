import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../../api/client';
import { motion, Reveal, Skeleton } from '../../components/motion';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/ConfirmDialog';
import PrescriptionModal from '../../components/PrescriptionModal';

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

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function initialsOf(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '?';
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

const TABS = [
  { key: 'today', label: 'Today' },
  { key: 'next30', label: 'Next 30 Days' },
  { key: 'prescriptions', label: 'Prescriptions' },
  { key: 'requests', label: 'New Requests' },
];

const QUICK_LINKS = [
  { to: '/doctor/calendar', label: 'Update Calendar', icon: 'M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z' },
  { to: '/doctor/patients', label: 'Your Patients', icon: 'M17 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M15 3.5a3 3 0 1 1 0 6M9 8.5a3 3 0 1 0 0-6M22 20v-1a3.5 3.5 0 0 0-2.5-3.35' },
  { to: '/doctor/finance', label: 'Financial Statements', icon: 'M4 19V9m6 10V5m6 14v-7M3 19h18' },
  { to: '/doctor/ask-ai', label: 'Ask Gen AI', icon: 'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Zm7 10 .8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8L19 13Z' },
];

function Icon({ path, className = 'h-[18px] w-[18px]' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

/** Prominent "what's next" card above the schedule table. */
function NextUpCard({ appt, loading }) {
  if (loading) {
    return (
      <div className="card !p-5 flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
    );
  }

  if (!appt) {
    return (
      <Reveal className="card !p-5 flex items-center gap-4 bg-gradient-to-r from-brand-50/70 to-white border-brand-100">
        <div className="h-12 w-12 rounded-full bg-white text-brand-500 flex items-center justify-center shrink-0 shadow-xs">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
            <path d="M9 12.5 11 14.5 15.5 9.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <div>
          <div className="font-semibold text-slate-800">You&apos;re all caught up</div>
          <div className="text-sm text-slate-500">No upcoming appointments on your schedule right now.</div>
        </div>
      </Reveal>
    );
  }

  const mins = minutesUntil(appt.slot.start);
  const expired = appt.mode === 'VIDEO' && isMeetingExpired(appt.slot.start);
  const joinable = appt.mode === 'VIDEO' && canJoinNow(appt.slot.start);

  return (
    <Reveal className="card !p-5 bg-gradient-to-r from-brand-600 to-brand-700 text-white border-0 shadow-card">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="h-12 w-12 rounded-full bg-white/15 text-white flex items-center justify-center shrink-0 font-display font-bold text-sm ring-1 ring-white/25">
          {initialsOf(appt.patient.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-brand-100/90">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
            </span>
            {expired ? 'Meeting Time Over' : `Next up${mins > 0 && mins <= 60 ? ` · in ${mins} min` : ''}`}
          </div>
          <div className="font-display font-bold text-lg truncate">{appt.patient.name}</div>
          <div className="text-sm text-brand-50/90">
            {formatWhen(appt.slot.start)} &middot; {appt.mode === 'VIDEO' ? 'Video consultation' : 'In-clinic visit'}
            {appt.isFollowUp && <span className="ml-2 badge bg-white/15 text-white">Follow-Up</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link to={`/doctor/appointments/${appt.id}`} className="btn bg-white/10 text-white hover:bg-white/20 !px-3 !py-2 text-sm">
            View Details
          </Link>
          {appt.mode === 'VIDEO' && (
            expired ? (
              <span className="badge bg-white/15 text-white !px-3 !py-1.5 text-xs font-semibold">
                Time Over (2h limit)
              </span>
            ) : (
              <Link
                to={`/consultation/${appt.id}`}
                className={`btn bg-white text-brand-700 hover:bg-brand-50 !px-4 !py-2 text-sm font-semibold ${joinable ? '' : 'pointer-events-none opacity-50'}`}
                aria-disabled={!joinable}
                title={joinable ? undefined : `Opens ${JOIN_WINDOW_MINUTES_BEFORE} min before the slot`}
              >
                Join Call
              </Link>
            )
          )}
        </div>
      </div>
    </Reveal>
  );
}

export default function DoctorDashboard() {
  const [scope, setScope] = useState('today'); // 'today' | 'next30' | 'prescriptions' | 'requests'
  const [appointments, setAppointments] = useState([]);
  const [selectedPrescription, setSelectedPrescription] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [nextUp, setNextUp] = useState(null);
  const [nextUpLoading, setNextUpLoading] = useState(true);
  const [actionBusyId, setActionBusyId] = useState(null);
  const [, forceTick] = useState(0);

  const toast = useToast();
  const confirm = useConfirm();

  const loadAppointments = useCallback(() => {
    setLoading(true);
    api.get('/doctor/appointments', { params: { scope } })
      .then((res) => setAppointments(res.data.appointments))
      .catch(() => setAppointments([]))
      .finally(() => setLoading(false));
  }, [scope]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  // Load count of pending requests for the badge
  const refreshPendingCount = useCallback(() => {
    api.get('/doctor/appointments', { params: { scope: 'requests' } })
      .then((res) => setPendingCount((res.data.appointments || []).length))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshPendingCount();
    const id = setInterval(refreshPendingCount, 30000);
    return () => clearInterval(id);
  }, [refreshPendingCount]);

  const handleAccept = async (id) => {
    setActionBusyId(id);
    try {
      const res = await api.post(`/doctor/appointments/${id}/accept`);
      toast.success(res.data.message || 'Appointment accepted & consultation room generated!');
      loadAppointments();
      refreshPendingCount();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setActionBusyId(null);
    }
  };

  const handleReject = async (id) => {
    const ok = await confirm({
      title: 'Reject this appointment request?',
      message: 'This will cancel the booking, release the time slot for other patients, and initiate any refund required.',
      confirmLabel: 'Reject Request',
      danger: true,
    });
    if (!ok) return;

    setActionBusyId(id);
    try {
      const res = await api.post(`/doctor/appointments/${id}/reject`, { reason: 'Doctor unavailable' });
      toast.success(res.data.message || 'Appointment rejected and slot released.');
      loadAppointments();
      refreshPendingCount();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setActionBusyId(null);
    }
  };

  useEffect(() => {
    api.get('/doctor/summary').then((res) => setProfile(res.data.profile));
  }, []);

  useEffect(() => {
    let alive = true;
    const loadNextUp = () => api.get('/doctor/appointments', { params: { scope: 'upcoming' } })
      .then((res) => { if (alive) setNextUp(res.data.appointments[0] || null); })
      .finally(() => { if (alive) setNextUpLoading(false); });
    loadNextUp();
    const id = setInterval(loadNextUp, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const firstName = useMemo(() => (profile?.name || '').replace(/^Dr\.?\s*/i, '').split(' ')[0], [profile]);

  return (
    <div className="space-y-5">
      <Reveal className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">
            {greeting()}{firstName ? `, Dr. ${firstName}` : ''}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Here&apos;s what&apos;s on your schedule.</p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden p-0.5 bg-white">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setScope(t.key)}
              className={`relative px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                scope === t.key ? 'text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {scope === t.key && (
                <motion.span
                  layoutId="dashboard-scope-pill"
                  className="absolute inset-0 bg-brand-600 rounded-md"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative">{t.label}</span>
              {t.key === 'requests' && pendingCount > 0 && (
                <span className={`relative text-xs px-1.5 py-0.2 rounded-full font-bold ${scope === 'requests' ? 'bg-white text-brand-700' : 'bg-brand-500 text-white'}`}>
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </Reveal>

      <NextUpCard appt={nextUp} loading={nextUpLoading} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {QUICK_LINKS.map((q, i) => (
          <motion.div
            key={q.to}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.25, delay: 0.04 * i }}
            className="group"
          >
            <Link
              to={q.to}
              className="card !p-3.5 flex flex-col items-center gap-2 text-center hover:shadow-card transition-shadow duration-200 h-full"
            >
              <span className="h-9 w-9 rounded-full bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                <Icon path={q.icon} />
              </span>
              <span className="text-xs font-medium text-slate-600 leading-tight">{q.label}</span>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="card !p-0 overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-4 pb-1">
          <h2 className="font-semibold text-slate-800">
            {scope === 'today'
              ? "Today's Schedule"
              : scope === 'next30'
              ? 'Upcoming (Next 30 Days)'
              : scope === 'prescriptions'
              ? 'Prescriptions Issued'
              : 'Incoming Appointment Requests'}
          </h2>
          {!loading && appointments.length > 0 && (
            <span className="badge bg-slate-100 text-slate-500">{appointments.length} appointment{appointments.length === 1 ? '' : 's'}</span>
          )}
        </div>
        {loading ? (
          <div className="p-4 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-8 w-24 rounded-lg ml-auto" />
              </div>
            ))}
          </div>
        ) : appointments.length === 0 ? (
          <Reveal className="p-8 flex flex-col items-center text-center gap-2 text-slate-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-10 w-10 text-slate-200">
              <path d="M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
            </svg>
            <p className="text-sm">
              {scope === 'today'
                ? "No appointments scheduled for today."
                : scope === 'next30'
                ? 'No appointments in the next 30 days.'
                : scope === 'prescriptions'
                ? 'No prescriptions recorded in this view.'
                : 'No pending appointment requests.'}
            </p>
          </Reveal>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Date &amp; Time</th>
                <th className="px-4 py-2 font-medium">Patient</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {appointments.map((a, i) => {
                const joinable = a.mode === 'VIDEO' && a.status === 'CONFIRMED' && canJoinNow(a.slot.start);
                const isBusy = actionBusyId === a.id;

                return (
                  <motion.tr
                    key={a.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.035 }}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">{formatWhen(a.slot.start)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="h-7 w-7 shrink-0 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-[11px] font-semibold">
                          {initialsOf(a.patient.name)}
                        </span>
                        <div>
                          <div className="font-medium text-slate-800">{a.patient.name}</div>
                          {a.symptoms && <div className="text-xs text-slate-400 truncate max-w-[180px]">{a.symptoms}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1">
                        {a.mode === 'VIDEO' ? '🎥 Video' : '🏥 Clinic'}
                        {a.isFollowUp && <span className="badge bg-amber-50 text-amber-700 ml-1">Follow-Up</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${
                        a.status === 'CONFIRMED'
                          ? 'bg-emerald-50 text-emerald-700'
                          : a.status === 'PENDING'
                          ? 'bg-amber-50 text-amber-700'
                          : a.status === 'COMPLETED'
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-red-50 text-red-600'
                      }`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {a.status === 'PENDING' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleAccept(a.id)}
                              disabled={isBusy}
                              className="btn-primary !px-3 !py-1 text-xs bg-emerald-600 hover:bg-emerald-700 border-emerald-600"
                            >
                              {isBusy ? '...' : 'Accept'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReject(a.id)}
                              disabled={isBusy}
                              className="btn-secondary !px-3 !py-1 text-xs text-red-600 hover:bg-red-50 border-red-200"
                            >
                              Reject
                            </button>
                          </>
                        ) : null}

                        {a.status === 'CONFIRMED' && a.mode === 'VIDEO' && (
                          isMeetingExpired(a.slot.start) ? (
                            <span className="text-xs text-slate-400 font-medium px-2 py-1 bg-slate-100 rounded">
                              Time Over
                            </span>
                          ) : (
                            <Link
                              to={`/consultation/${a.id}`}
                              className={`btn-primary !px-3 !py-1 text-xs ${joinable ? '' : 'pointer-events-none opacity-40'}`}
                              aria-disabled={!joinable}
                              title={joinable ? undefined : `Opens ${JOIN_WINDOW_MINUTES_BEFORE} min before slot`}
                            >
                              {joinable && (
                                <span className="relative flex h-2 w-2 mr-1">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                                </span>
                              )}
                              Join Call
                            </Link>
                          )
                        )}

                        {a.prescription && (
                          <button
                            type="button"
                            onClick={() => setSelectedPrescription(a)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                            title="View / Print Digital Prescription Slip"
                          >
                            <span>℞</span>
                            <span>View Rx</span>
                          </button>
                        )}

                        <Link to={`/doctor/appointments/${a.id}`} className="text-brand-600 text-xs font-medium hover:underline ml-1">
                          Details
                        </Link>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Official Medical Prescription Modal */}
      <PrescriptionModal
        isOpen={!!selectedPrescription}
        onClose={() => setSelectedPrescription(null)}
        appointment={selectedPrescription}
        doctor={profile}
      />
    </div>
  );
}
