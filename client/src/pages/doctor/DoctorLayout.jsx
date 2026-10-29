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

function Counter({ label, value, delay, compact = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.3, delay }}
      className={`rounded-xl bg-gradient-to-br from-brand-50 to-white border border-brand-100 transition-shadow hover:shadow-card ${
        compact ? 'px-2.5 py-2 text-center' : 'px-3 py-2.5'
      }`}
    >
      <div className={`${compact ? 'text-lg sm:text-xl' : 'text-2xl'} font-display font-bold tabular-nums text-brand-700`}>
        <AnimatedNumber value={value} />
      </div>
      <div className="text-[10px] sm:text-[11px] font-medium text-slate-500 leading-tight mt-0.5 line-clamp-2">{label}</div>
    </motion.div>
  );
}

export default function DoctorLayout() {
  const [summary, setSummary] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 lg:gap-6 items-start">
      {/* Mobile / Tablet Compact Header + Horizontal Nav (< lg) */}
      <div className="lg:hidden space-y-3 min-w-0">
        <div className="card !p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative h-10 w-10 shrink-0">
                <span className="absolute inset-0 rounded-full bg-brand-400 animate-ping opacity-30" />
                <div className="relative h-10 w-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center font-display font-bold text-sm shadow-card">
                  {initials || 'Dr'}
                </div>
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 text-sm sm:text-base truncate">
                  {summary?.profile?.name || 'Doctor'}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {summary?.profile?.speciality || ''}
                  {summary?.profile?.registrationNo ? ` · Reg. ${summary.profile.registrationNo}` : ''}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0"
              aria-label="Toggle Doctor Menu"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
                {mobileMenuOpen ? (
                  <path d="M18 6 6 18M6 6l12 12" />
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>

          {/* 3-Column Compact Live Counters on Mobile/Tablet */}
          <div className="grid grid-cols-3 gap-2">
            <Counter compact label="Today" value={summary?.counters?.todayAppointments} delay={0} />
            <Counter compact label="This Month" value={summary?.counters?.consultsThisMonth} delay={0.05} />
            <Counter compact label="All Patients" value={summary?.counters?.patientsConsulted} delay={0.1} />
          </div>

          {/* Expandable Mobile Full Drawer Menu */}
          {mobileMenuOpen && (
            <nav className="flex flex-col gap-1 pt-2 border-t border-slate-100">
              {NAV_LINKS.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`
                  }
                >
                  <Icon path={l.icon} className="h-[18px] w-[18px] shrink-0" />
                  <span>{l.label}</span>
                </NavLink>
              ))}
            </nav>
          )}
        </div>

        {/* Horizontal Scrollable Pill Nav Bar for Fast Switching on Mobile/Tablet */}
        <nav className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {NAV_LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-brand-600 text-white border-brand-600 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`
              }
            >
              <Icon path={l.icon} className="h-4 w-4 shrink-0" />
              <span>{l.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Desktop Sticky Sidebar (lg+) */}
      <aside className="hidden lg:block card !p-4 space-y-4 lg:sticky lg:top-20">
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

      <div className="min-w-0 w-full">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </div>
    </div>
    </ConfirmProvider>
    </ToastProvider>
  );
}
