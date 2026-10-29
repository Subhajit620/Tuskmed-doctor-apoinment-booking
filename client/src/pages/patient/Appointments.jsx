import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const READINESS_NOTES = [
  'Supported browsers: Chrome, Safari, Firefox, and Edge.',
  'Please allow camera and microphone access when prompted.',
  'A stable internet connection gives the best call quality.',
  'Stay logged in to TuskMed for the duration of your consultation.',
];

const JOIN_WINDOW_MINUTES_BEFORE = 15;
const JOIN_WINDOW_MINUTES_AFTER = 120; // 2 hours

function AppointmentCard({ appt }) {
  const start = new Date(appt.slot.start);
  const now = new Date();
  const opensAt = new Date(start.getTime() - JOIN_WINDOW_MINUTES_BEFORE * 60 * 1000);
  const closesAt = new Date(start.getTime() + JOIN_WINDOW_MINUTES_AFTER * 60 * 1000);
  const isExpired = now > closesAt;
  const isPast = now > start;
  const canJoin = appt.mode === 'VIDEO' && appt.status === 'CONFIRMED' && now >= opensAt && !isExpired;
  const isCompleted = appt.status === 'COMPLETED' || appt.status === 'CANCELLED';

  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">{appt.doctor.name}</div>
          <div className="text-sm text-brand-600">{appt.doctor.speciality}</div>
        </div>
        <span className={`badge ${appt.status === 'CONFIRMED' ? 'bg-green-50 text-green-700' : appt.status === 'COMPLETED' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
          {appt.status}
        </span>
      </div>
      <div className="text-sm text-slate-500">
        {start.toLocaleString()} &middot; {appt.mode === 'VIDEO' ? 'Video' : 'In-clinic'} &middot; for {appt.patient.name}
      </div>

      {!isCompleted && appt.mode === 'VIDEO' && appt.status === 'CONFIRMED' && (
        <div className="pt-1">
          {isExpired ? (
            <span className="badge bg-slate-100 text-slate-500 text-xs py-1.5 px-3">
              Meeting Time Over (2h limit)
            </span>
          ) : (
            <Link
              to={`/consultation/${appt.id}`}
              className={`btn-primary text-xs py-2 px-4 inline-flex items-center gap-2 ${canJoin ? 'bg-emerald-600 hover:bg-emerald-700 animate-pulse' : ''}`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
              </span>
              {canJoin ? '🎥 Join Video Call Now' : '🎥 Join Video Call (Pre-Check)'}
            </Link>
          )}
        </div>
      )}

      <div className="flex gap-3 text-sm pt-1">
        <Link to={`/patient/appointments/${appt.id}`} className="text-brand-600 font-medium">View details</Link>
        <Link to={`/patient/appointments/${appt.id}/messages`} className="text-brand-600 font-medium">Messages</Link>
        {isPast && (appt.report || appt.prescription) && (
          <Link to={`/patient/appointments/${appt.id}`} className="text-brand-600 font-medium">Report & Prescription</Link>
        )}
      </div>
    </div>
  );
}

export default function Appointments() {
  const { activePatient } = useAuth();
  const [upcoming, setUpcoming] = useState([]);
  const [past, setPast] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activePatient) {
      setLoading(false);
      return;
    }
    Promise.all([
      api.get('/appointments/mine', { params: { scope: 'upcoming' } }),
      api.get('/appointments/mine', { params: { scope: 'past' } }),
    ])
      .then(([u, p]) => {
        setUpcoming(u.data.appointments);
        setPast(p.data.appointments);
      })
      .catch(() => {
        setUpcoming([]);
        setPast([]);
      })
      .finally(() => setLoading(false));
  }, [activePatient]);

  if (loading) return <p className="text-slate-400">Loading appointments...</p>;

  const isEmpty = upcoming.length === 0 && past.length === 0;

  if (isEmpty) {
    return (
      <div className="card text-center py-12 space-y-3">
        <div className="mx-auto h-14 w-14 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
            <path d="M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold">No appointments yet</h2>
        <p className="text-slate-500 text-sm">Book your first consultation to see it here.</p>
        <Link to="/patient/book" className="btn-primary inline-flex">Book an appointment</Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">My Booked Appointments</h1>

      <div className="card bg-slate-50 border-dashed">
        <h3 className="font-semibold text-sm mb-2">Before you join a video call</h3>
        <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1">
          {READINESS_NOTES.map((n) => <li key={n}>{n}</li>)}
        </ul>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-400">No upcoming appointments.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">{upcoming.map((a) => <AppointmentCard key={a.id} appt={a} />)}</div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Past</h2>
        {past.length === 0 ? (
          <p className="text-sm text-slate-400">No past appointments.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">{past.map((a) => <AppointmentCard key={a.id} appt={a} />)}</div>
        )}
      </div>
    </div>
  );
}
