import { useState } from 'react';
import { AnimatePresence, motion } from '../../components/motion';
import { ToastProvider } from '../../components/Toast';
import { ConfirmProvider } from '../../components/ConfirmDialog';
import DoctorsPanel from './panels/DoctorsPanel';
import SlotsPanel from './panels/SlotsPanel';
import AppointmentsPanel from './panels/AppointmentsPanel';
import PrescriptionsPanel from './panels/PrescriptionsPanel';
import PaymentsPanel from './panels/PaymentsPanel';
import PromoCodesPanel from './panels/PromoCodesPanel';
import TicketsPanel from './panels/TicketsPanel';
import ConfigPanel from './panels/ConfigPanel';

const ICONS = {
  doctors: 'M17 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M15 3.5a3 3 0 1 1 0 6M9 8.5a3 3 0 1 0 0-6M22 20v-1a3.5 3.5 0 0 0-2.5-3.35',
  slots: 'M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
  appointments: 'M12 8v5l3 2M4 12a8 8 0 1 1 3.05 6.29M4 12v5m0-5H2m2 5 3.5-1',
  prescriptions: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  payments: 'M4 19V9m6 10V5m6 14v-7M3 19h18',
  promos: 'M12.6 2.6 21 11a2 2 0 0 1 0 2.8l-6.2 6.2a2 2 0 0 1-2.8 0L2.6 10.6A2 2 0 0 1 2 9.2V3a1 1 0 0 1 1-1h6.2a2 2 0 0 1 1.4.6ZM7 7h.01',
  tickets: 'M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3v5ZM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3v5Z',
  config: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
};

function Icon({ path, className = 'h-[18px] w-[18px]' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

const TABS = [
  { key: 'doctors', label: 'Doctors', icon: ICONS.doctors, Component: DoctorsPanel },
  { key: 'slots', label: 'Slots', icon: ICONS.slots, Component: SlotsPanel },
  { key: 'appointments', label: 'Appointments', icon: ICONS.appointments, Component: AppointmentsPanel },
  { key: 'prescriptions', label: 'Prescriptions', icon: ICONS.prescriptions, Component: PrescriptionsPanel },
  { key: 'payments', label: 'Payments', icon: ICONS.payments, Component: PaymentsPanel },
  { key: 'promos', label: 'Promo Codes', icon: ICONS.promos, Component: PromoCodesPanel },
  { key: 'tickets', label: 'Support Tickets', icon: ICONS.tickets, Component: TicketsPanel },
  { key: 'config', label: 'Settings', icon: ICONS.config, Component: ConfigPanel },
];

export default function AdminDashboard() {
  const [tab, setTab] = useState('doctors');
  const active = TABS.find((t) => t.key === tab);
  const Active = active?.Component;

  return (
    <ToastProvider>
    <ConfirmProvider>
    <div className="theme-gold grid grid-cols-1 md:grid-cols-[250px_1fr] gap-6 items-start">
      <motion.aside
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white rounded-[22px] shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-[#EBE3D8] p-4 space-y-1 md:sticky md:top-20"
      >
        <div className="flex items-center gap-2.5 px-2 pb-3 mb-1 border-b border-[#F0E5DA]">
          <div className="h-9 w-9 shrink-0 rounded-full bg-[#CAA067] text-white flex items-center justify-center shadow-xs transition-transform duration-300 hover:scale-110">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4.5 w-4.5">
              <path d="M12 2 3 7v6c0 5 4 8.5 9 9 5-.5 9-4 9-9V7l-9-5Z" />
            </svg>
          </div>
          <h1 className="text-[17px] font-display font-black text-[#2B434C] leading-tight">Admin Panel</h1>
        </div>

        <nav className="flex flex-col gap-0.5">
          {TABS.map((t, i) => (
            <motion.button
              key={t.key}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: 0.04 * i }}
              onClick={() => setTab(t.key)}
              className={`relative w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition-colors duration-200 ${
                tab === t.key ? 'text-white' : 'text-[#4B5B62] hover:bg-[#FAF3EC] hover:text-[#2B434C]'
              }`}
            >
              {tab === t.key && (
                <motion.span
                  layoutId="admin-nav-pill"
                  className="absolute inset-0 rounded-xl shadow-[0_2px_10px_rgba(202,160,103,0.35)]"
                  style={{ backgroundColor: '#CAA067' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative flex items-center gap-2.5">
                <Icon path={t.icon} />
                {t.label}
              </span>
            </motion.button>
          ))}
        </nav>
      </motion.aside>

      <div className="min-w-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {Active && <Active />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
    </ConfirmProvider>
    </ToastProvider>
  );
}
