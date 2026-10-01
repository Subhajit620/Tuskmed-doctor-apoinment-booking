import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import api from '../../api/client';
import { AnimatedNumber, motion, PageTransition } from '../../components/motion';
import { ToastProvider } from '../../components/Toast';
import { ConfirmProvider } from '../../components/ConfirmDialog';

const ICONS = {
  dashboard: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z',
  history: 'M12 8v5l3 2M4 12a8 8 0 1 1 3.05 6.29M4 12v5m0-5H2m2 5 3.5-1',
  calendar: 'M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
  finance: 'M4 19V9m6 10V5m6 14v-7M3 19h18',
  patients: 'M17 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M15 3.5a3 3 0 1 1 0 6M9 8.5a3 3 0 1 0 0-6M22 20v-1a3.5 3.5 0 0 0-2.5-3.35',
  profile: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-7 8a7 7 0 0 1 14 0',
  ai: 'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Zm7 10 .8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8L19 13Z',
};

function Icon({ path, className = 'h-[18px] w-[18px]' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

const NAV_LINKS = [
  { to: '/doctor', label: 'Dashboard', end: true, icon: ICONS.dashboard },
  { to: '/doctor/past-appointments', label: 'Your Past Appointments', icon: ICONS.history },
  { to: '/doctor/calendar', label: 'Update Calendar', icon: ICONS.calendar },
  { to: '/doctor/finance', label: 'Financial Statements', icon: ICONS.finance },
  { to: '/doctor/patients', label: 'Your Patients', icon: ICONS.patients },
  { to: '/doctor/profile', label: 'View Profile', icon: ICONS.profile },
  { to: '/doctor/ask-ai', label: 'Ask Gen AI', icon: ICONS.ai },
];

function Counter({ label, value, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.03 }}
      transition={{ duration: 0.3, delay }}
      className="rounded-lg bg-gradient-to-br from-brand-50 to-white border border-brand-100 px-3 py-2.5 transition-shadow hover:shadow-card"
    >
      <div className="text-2xl font-display font-bold tabular-nums text-brand-700">
        <AnimatedNumber value={value} />
      </div>
      <div className="text-[11px] font-medium text-slate-500 leading-tight mt-0.5">{label}</div>
    </motion.div>
  );
}

export default function DoctorLayout() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => api.get('/doctor/summary').then((res) => { if (alive) setSummary(res.data); });
    load();
    const interval = setInterval(load, 60000); // counters stay live without a full page reload
    return () => { alive = false; clearInterval(interval); };
  }, []);

  const initials = (summary?.profile?.name || 'Dr')
    .replace(/^Dr\.?\s*/i, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  return (
    <ToastProvider>
    <ConfirmProvider>
    <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6 items-start">
      <aside className="card !p-4 space-y-4 md:sticky md:top-20">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 shrink-0">
            <span className="absolute inset-0 rounded-full bg-brand-400 animate-ping opacity-30" />
            <div className="relative h-10 w-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center font-display font-bold text-sm shadow-card">
              {initials || 'Dr'}
            </div>
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 truncate">{summary?.profile?.name || 'Doctor'}</div>
            <div className="text-xs text-slate-500 truncate">{summary?.profile?.speciality || ''}</div>
          </div>
        </div>
        {summary?.profile?.registrationNo && (
          <div className="text-[11px] text-slate-400 -mt-2">Reg. {summary.profile.registrationNo}</div>
        )}

        <div className="grid grid-cols-1 gap-2">
          <Counter label="Today's Appointments" value={summary?.counters?.todayAppointments} delay={0} />
          <Counter label="Consults This Month" value={summary?.counters?.consultsThisMonth} delay={0.05} />
          <Counter label="Patients Consulted (all-time)" value={summary?.counters?.patientsConsulted} delay={0.1} />
        </div>

        <nav className="flex flex-col gap-0.5 pt-3 border-t border-slate-100">
          {NAV_LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `group relative px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="doctor-nav-pill"
                      className="absolute inset-0 bg-gradient-to-r from-brand-600 to-brand-500 rounded-lg shadow-card"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <span className="relative flex items-center gap-2.5">
                    <Icon path={l.icon} className="h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110" />
                    {l.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="min-w-0">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </div>
    </div>
    </ConfirmProvider>
    </ToastProvider>
  );
}
