import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { PageTransition, motion, AnimatePresence } from '../../components/motion';
import PatientProfileModal from '../../components/patient/PatientProfileModal';
import WelcomeModal from '../../components/patient/WelcomeModal';

const TOP_GROUP_LINKS = [
  {
    to: '/patient/book',
    label: 'Book Appointment',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-[22px] w-[22px] shrink-0 text-emerald-600">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    to: '/patient/personal-info',
    label: 'Personal Information',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[22px] w-[22px] shrink-0">
        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    to: '/patient/register-patient',
    label: 'Register a New Patient',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[22px] w-[22px] shrink-0">
        <path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
      </svg>
    ),
  },
  {
    to: '/patient/change-patient',
    label: 'Change Patient',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[22px] w-[22px] shrink-0">
        <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    to: '/patient/support',
    label: 'Help & Support',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[22px] w-[22px] shrink-0">
        <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

const BOTTOM_GROUP_LINKS = [
  {
    to: '/patient/doctors',
    label: 'Our Doctors',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[22px] w-[22px] shrink-0">
        <path d="M4.5 3.75a3 3 0 00-3 3v.75a6 6 0 006 6h.75a6 6 0 006-6v-.75a3 3 0 00-3-3m-6.75 6.75v5.25a3.75 3.75 0 007.5 0v-1.5m3.75-7.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm-13.5 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
      </svg>
    ),
  },
  {
    to: '/patient/post-query',
    label: 'Post Query',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[22px] w-[22px] shrink-0">
        <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    to: '/patient/past-records',
    label: 'Past Appointments & Prescriptions',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[22px] w-[22px] shrink-0">
        <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    to: '/patient/upload-documents',
    label: 'Upload Documents',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[22px] w-[22px] shrink-0">
        <path d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    to: '/patient/messages',
    label: 'Message Box',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[22px] w-[22px] shrink-0">
        <path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    to: '/patient/health-monitoring',
    label: 'Health Monitoring',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[22px] w-[22px] shrink-0">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
];

export default function PatientLayout() {
  const { account, activePatient } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [welcomeModalOpen, setWelcomeModalOpen] = useState(false);

  const closeMenu = () => setMobileMenuOpen(false);

  const sidebarContent = (
    <div className="space-y-4 w-full">
      {/* Welcome & Interactive Profile Card */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setProfileModalOpen(true)}
        className="w-full rounded-2xl bg-gradient-to-br from-[#EED8C5] to-[#E5CBB4] border border-[#E4C7B0] p-4 sm:p-5 text-center shadow-xs cursor-pointer group transition-all"
      >
        <div className="flex items-center justify-center gap-2 mb-1">
          <div className="h-7 w-7 rounded-full bg-[#CAA067] text-white flex items-center justify-center font-black text-xs shadow-2xs">
            {activePatient?.name ? activePatient.name[0].toUpperCase() : '👤'}
          </div>
          <span className="text-xs font-bold text-slate-700 tracking-wide">Patient Profile</span>
        </div>
        <div className="font-extrabold text-slate-900 text-base sm:text-lg capitalize truncate">
          {activePatient?.name || account?.mobile || 'Guest'}
        </div>
        <div className="text-[11px] text-[#B88F55] font-bold mt-1 group-hover:underline flex items-center justify-center gap-1">
          <span>View Profile Card</span>
          <span>&rarr;</span>
        </div>
      </motion.button>

      {/* Top Navigation Group Card */}
      <div className="rounded-2xl bg-[#FAF3EC] border border-[#F0E5DA] p-3 space-y-1.5 shadow-xs">
        {TOP_GROUP_LINKS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={closeMenu}
            className={({ isActive }) =>
              `px-3.5 py-3 rounded-xl text-[14.5px] sm:text-[15px] font-semibold flex items-center gap-3.5 transition-all ${
                isActive
                  ? 'bg-[#CAA067] text-white shadow-xs font-bold'
                  : 'text-[#2C3E44] hover:bg-[#F2E5D8] hover:text-slate-900'
              }`
            }
          >
            {item.icon}
            <span className="leading-snug">{item.label}</span>
          </NavLink>
        ))}
      </div>

      {/* Dashboard Button & Welcome Guide */}
      <div className="space-y-2">
        <NavLink
          to="/patient"
          end
          onClick={closeMenu}
          className={({ isActive }) =>
            `w-full px-4 py-3.5 rounded-xl text-base sm:text-[17px] font-bold flex items-center gap-3.5 transition-all ${
              isActive
                ? 'bg-[#2B434C] text-white shadow-sm'
                : 'bg-white border border-[#E5D7CA] text-[#2C3E44] hover:bg-[#FAF3EC]'
            }`
          }
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6 shrink-0">
            <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span>Dashboard</span>
        </NavLink>

        <button
          type="button"
          onClick={() => {
            closeMenu();
            setWelcomeModalOpen(true);
          }}
          className="w-full px-4 py-2.5 rounded-xl text-xs font-bold bg-[#FAF3EC] text-[#CAA067] hover:bg-[#F2E5D8] border border-[#F0E5DA] flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <span>✨</span>
          <span>Welcome Tour & Guide</span>
        </button>
      </div>

      {/* Lower Navigation Items */}
      <div className="space-y-1 px-0.5">
        {BOTTOM_GROUP_LINKS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={closeMenu}
            className={({ isActive }) =>
              `px-3.5 py-3 rounded-xl text-[14.5px] sm:text-[15px] font-semibold flex items-center gap-3.5 transition-all ${
                isActive
                  ? 'bg-[#CAA067] text-white shadow-xs font-bold'
                  : 'text-[#2C3E44] hover:bg-[#FAF3EC] hover:text-slate-900'
              }`
            }
          >
            {item.icon}
            <span className="leading-snug">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );

  return (
    <div className="w-full">
      {/* Modals */}
      <PatientProfileModal open={profileModalOpen} onClose={() => setProfileModalOpen(false)} />
      <WelcomeModal forceOpen={welcomeModalOpen} onClose={() => setWelcomeModalOpen(false)} />

      {/* Mobile Top Navigation Trigger (visible on screens < md) */}
      <div className="md:hidden flex items-center justify-between bg-[#FAF3EC] border border-[#F0E5DA] rounded-2xl p-3.5 mb-6 shadow-xs">
        <button
          type="button"
          onClick={() => setProfileModalOpen(true)}
          className="flex items-center gap-2.5 text-left cursor-pointer"
        >
          <div className="h-8 w-8 rounded-lg bg-[#CAA067] text-white flex items-center justify-center font-bold text-xs">
            {activePatient?.name ? activePatient.name[0].toUpperCase() : 'P'}
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-medium leading-none">Active Patient</div>
            <div className="font-bold text-slate-900 text-sm">{activePatient?.name || account?.mobile || 'Guest'}</div>
          </div>
        </button>

        <button
          onClick={() => setMobileMenuOpen(true)}
          className="bg-[#2B434C] text-white px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
          <span>Menu</span>
        </button>
      </div>

      {/* Mobile Drawer Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeMenu}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative bg-[#FDFBF9] w-[300px] max-w-[85vw] h-full overflow-y-auto p-5 flex flex-col justify-between shadow-2xl z-10"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#F0E5DA]">
                  <span className="font-extrabold text-[#1B365D] text-lg font-display">Navigation</span>
                  <button
                    onClick={closeMenu}
                    className="h-8 w-8 rounded-xl bg-[#FAF3EC] hover:bg-[#F2E5D8] text-slate-700 flex items-center justify-center font-bold text-base transition-colors"
                  >
                    ✕
                  </button>
                </div>
                {sidebarContent}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Desktop & Main Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] lg:grid-cols-[280px_1fr] gap-8 lg:gap-12 items-start w-full">
        {/* Desktop Sticky Sidebar */}
        <aside className="hidden md:block space-y-4 md:sticky md:top-24 w-full">
          {sidebarContent}
        </aside>

        {/* Main Content Area */}
        <div className="min-w-0 w-full">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </div>
      </div>
    </div>
  );
}
