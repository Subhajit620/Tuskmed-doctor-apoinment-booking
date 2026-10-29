import { useEffect, useState } from 'react';
import api, { apiErrorMessage } from '../../api/client';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/ConfirmDialog';
import { motion, Reveal } from '../../components/motion';

const MODE_LABELS = { VIDEO: 'Video', IN_CLINIC: 'Clinic', BOTH: 'Both' };

function toDateInput(d) {
  return d.toISOString().slice(0, 10);
}

/** One-click shortcuts for the most common blocking patterns, so a doctor
 * doesn't have to type out today's/this week's dates by hand every time. */
function QuickBlockShortcuts({ onPick }) {
  const today = new Date();
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 6);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const shortcuts = [
    { label: 'Block today', start: today, end: today },
    { label: 'Block tomorrow', start: tomorrow, end: tomorrow },
    { label: 'Block this week', start: today, end: weekEnd },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {shortcuts.map((s) => (
        <motion.button
          key={s.label}
          type="button"
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.96 }}
          className="text-xs font-medium px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 transition-colors"
          onClick={() => onPick(toDateInput(s.start), toDateInput(s.end))}
        >
          {s.label}
        </motion.button>
      ))}
    </div>
  );
}

function BlockFullDays({ onBlocked }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [mode, setMode] = useState('BOTH');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/doctor/blocked-periods', { startDate, endDate, mode });
      toast.success(startDate === endDate ? `${startDate} blocked.` : `${startDate} to ${endDate} blocked.`);
      setStartDate('');
      setEndDate('');
      onBlocked();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">Block Full Days</h2>
      <p className="text-sm text-slate-500">
        Prevents new bookings on these dates. Appointments already confirmed within this range are not affected.
      </p>
      <QuickBlockShortcuts onPick={(s, e) => { setStartDate(s); setEndDate(e); }} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Call type</label>
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="BOTH">Both</option>
            <option value="VIDEO">Video</option>
            <option value="IN_CLINIC">Clinic</option>
          </select>
        </div>
      </div>
      <button className="btn-primary" disabled={busy || !startDate || !endDate} onClick={submit}>
        {busy ? 'Blocking...' : 'Block these days'}
      </button>
    </div>
  );
}

function EditSlotsByDate() {
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(null);
  const toast = useToast();

  const load = (d) => {
    if (!d) return;
    setLoading(true);
    api.get('/doctor/slots', { params: { date: d } }).then((res) => setSlots(res.data.slots)).finally(() => setLoading(false));
  };

  useEffect(() => { load(date); }, [date]);

  const toggle = async (slot) => {
    if (!['AVAILABLE', 'CANCELLED'].includes(slot.status)) return;
    setToggling(slot.id);
    try {
      await api.patch(`/doctor/slots/${slot.id}/toggle`);
      toast.success(slot.status === 'AVAILABLE' ? 'Slot disabled.' : 'Slot enabled.');
      load(date);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setToggling(null);
    }
  };

  const availableCount = slots.filter((s) => s.status === 'AVAILABLE').length;

  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">Edit Slots by Date</h2>
      <div className="max-w-xs">
        <label className="label">Date</label>
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {!date ? (
        <p className="text-sm text-slate-400">Choose a date to see and toggle its slots.</p>
      ) : loading ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : slots.length === 0 ? (
        <p className="text-sm text-slate-400">No slots exist for this date yet.</p>
      ) : (
        <>
          <p className="text-xs text-slate-400">{availableCount} of {slots.length} slots available &middot; click a slot to enable/disable it</p>
          <div className="flex flex-wrap gap-2">
            {slots.map((s, i) => {
              const enabled = s.status === 'AVAILABLE';
              const locked = !['AVAILABLE', 'CANCELLED'].includes(s.status);
              return (
                <motion.button
                  key={s.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.03 }}
                  whileHover={locked ? undefined : { scale: 1.05 }}
                  whileTap={locked ? undefined : { scale: 0.95 }}
                  disabled={locked || toggling === s.id}
                  onClick={() => toggle(s)}
                  title={locked ? `This slot is ${s.status.toLowerCase()} and can't be toggled` : enabled ? 'Click to disable' : 'Click to enable'}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-60 ${
                    locked
                      ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                      : enabled
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                  }`}
                >
                  {new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &middot; {MODE_LABELS[s.mode]}
                  <span className="ml-2 text-xs">{toggling === s.id ? 'Saving...' : locked ? s.status : enabled ? 'Enabled' : 'Disabled'}</span>
                </motion.button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function DoctorCalendar() {
  const [tab, setTab] = useState('block');
  const [blockedPeriods, setBlockedPeriods] = useState([]);
  const toast = useToast();
  const confirm = useConfirm();

  const loadBlocked = () => api.get('/doctor/blocked-periods').then((res) => setBlockedPeriods(res.data.blockedPeriods));
  useEffect(() => { loadBlocked(); }, []);

  const remove = async (bp) => {
    const ok = await confirm({
      title: 'Unblock these days?',
      message: `${new Date(bp.startDate).toLocaleDateString()} – ${new Date(bp.endDate).toLocaleDateString()} will become bookable again.`,
      confirmLabel: 'Unblock',
    });
    if (!ok) return;
    try {
      await api.delete(`/doctor/blocked-periods/${bp.id}`);
      toast.success('Blocked days removed.');
      loadBlocked();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Update Calendar</h1>

      <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
        {[{ key: 'block', label: 'Block Full Days' }, { key: 'edit', label: 'Edit Slots by Date' }].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium ${tab === t.key ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Reveal key={tab}>
        {tab === 'block' ? <BlockFullDays onBlocked={loadBlocked} /> : <EditSlotsByDate />}
      </Reveal>

      <div className="card !p-0 overflow-x-auto">
        <h2 className="font-semibold px-4 pt-4 pb-2">Your Blocked Days</h2>
        {blockedPeriods.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">No blocked days yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Start Date</th>
                <th className="px-4 py-2 font-medium">End Date</th>
                <th className="px-4 py-2 font-medium">Call Type</th>
                <th className="px-4 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {blockedPeriods.map((bp, i) => (
                <motion.tr
                  key={bp.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: i * 0.04 }}
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  <td className="px-4 py-3">{new Date(bp.startDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{new Date(bp.endDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{MODE_LABELS[bp.mode]}</td>
                  <td className="px-4 py-3">
                    <button className="text-red-600 font-medium hover:underline" onClick={() => remove(bp)}>Remove</button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
