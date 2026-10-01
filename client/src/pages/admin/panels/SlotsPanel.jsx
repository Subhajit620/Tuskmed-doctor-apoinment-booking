import { useEffect, useMemo, useState } from 'react';
import api, { apiErrorMessage } from '../../../api/client';
import { useToast } from '../../../components/Toast';
import { useConfirm } from '../../../components/ConfirmDialog';

const WEEKDAYS = [
  { key: 1, label: 'Mon' }, { key: 2, label: 'Tue' }, { key: 3, label: 'Wed' },
  { key: 4, label: 'Thu' }, { key: 5, label: 'Fri' }, { key: 6, label: 'Sat' }, { key: 0, label: 'Sun' },
];
const DURATIONS = [15, 20, 30, 45, 60];
const STATUS_STYLES = {
  AVAILABLE: 'bg-emerald-100 text-emerald-700',
  LOCKED: 'bg-amber-100 text-amber-700',
  BOOKED: 'bg-brand-100 text-brand-700',
  CANCELLED: 'bg-slate-100 text-slate-400',
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** Every slot start time implied by the generator form - pure function so it
 * can be sanity-checked (and previewed) before anything is sent to the server. */
function buildSlotPlan({ fromDate, toDate, weekdays, startHour, endHour, durationMin, breakStartHour, breakEndHour, mode }) {
  const plan = [];
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  const now = new Date();
  const modes = mode === 'BOTH' ? ['VIDEO', 'IN_CLINIC'] : [mode];

  for (let day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
    if (!weekdays.has(day.getDay())) continue;
    for (let minutes = startHour * 60; minutes + durationMin <= endHour * 60; minutes += durationMin) {
      const onBreak = breakStartHour != null && breakEndHour != null && minutes >= breakStartHour * 60 && minutes < breakEndHour * 60;
      if (onBreak) continue;
      const start = new Date(day);
      start.setHours(0, minutes, 0, 0);
      if (start <= now) continue; // never generate slots in the past
      const end = new Date(start.getTime() + durationMin * 60000);
      for (const m of modes) plan.push({ start: start.toISOString(), end: end.toISOString(), mode: m });
    }
  }
  return plan;
}

export default function SlotsPanel() {
  const toast = useToast();
  const confirm = useConfirm();

  const [doctors, setDoctors] = useState([]);
  const [doctorId, setDoctorId] = useState('');
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  // Generator form
  const [fromDate, setFromDate] = useState(todayStr());
  const [toDate, setToDate] = useState(todayStr());
  const [weekdays, setWeekdays] = useState(new Set([1, 2, 3, 4, 5, 6, 0]));
  const [startHour, setStartHour] = useState(10);
  const [endHour, setEndHour] = useState(17);
  const [duration, setDuration] = useState(30);
  const [useBreak, setUseBreak] = useState(false);
  const [breakStartHour, setBreakStartHour] = useState(13);
  const [breakEndHour, setBreakEndHour] = useState(14);
  const [mode, setMode] = useState('VIDEO');
  const [generating, setGenerating] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    api.get('/admin/doctors').then((res) => setDoctors(res.data.doctors));
  }, []);

  const loadSlots = (id) => {
    if (!id) { setSlots([]); return; }
    setSlotsLoading(true);
    api.get('/admin/slots', { params: { doctorId: id } }).then((res) => setSlots(res.data.slots)).finally(() => setSlotsLoading(false));
  };

  useEffect(() => loadSlots(doctorId), [doctorId]);

  const toggleWeekday = (key) => {
    setWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const plan = useMemo(() => {
    if (!fromDate || !toDate || weekdays.size === 0 || endHour <= startHour) return [];
    return buildSlotPlan({
      fromDate, toDate, weekdays, startHour: Number(startHour), endHour: Number(endHour),
      durationMin: Number(duration),
      breakStartHour: useBreak ? Number(breakStartHour) : null,
      breakEndHour: useBreak ? Number(breakEndHour) : null,
      mode,
    });
  }, [fromDate, toDate, weekdays, startHour, endHour, duration, useBreak, breakStartHour, breakEndHour, mode]);

  const generate = async () => {
    setFormError('');
    if (!doctorId) { setFormError('Select a doctor first.'); return; }
    if (toDate < fromDate) { setFormError('"To" date must be on or after "From" date.'); return; }
    if (plan.length === 0) { setFormError('This combination produces no slots - check the date range, weekdays and hours.'); return; }

    setGenerating(true);
    try {
      const res = await api.post('/admin/slots/bulk', { doctorId, slots: plan });
      const { createdCount, skippedCount } = res.data;
      if (createdCount === 0) {
        toast.info('All of those slots already exist - nothing new to add.');
      } else if (skippedCount > 0) {
        toast.success(`${createdCount} slot${createdCount === 1 ? '' : 's'} created, ${skippedCount} already existed and were skipped.`);
      } else {
        toast.success(`${createdCount} slot${createdCount === 1 ? '' : 's'} created.`);
      }
      loadSlots(doctorId);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  };

  const cancelSlot = async (slot) => {
    const ok = await confirm({
      title: 'Cancel this slot?',
      message: `${new Date(slot.start).toLocaleString()} will no longer be bookable.`,
      confirmLabel: 'Cancel slot',
      danger: true,
    });
    if (!ok) return;
    setCancellingId(slot.id);
    try {
      await api.delete(`/admin/slots/${slot.id}`);
      toast.success('Slot cancelled.');
      loadSlots(doctorId);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setCancellingId(null);
    }
  };

  const groupedByDate = useMemo(() => {
    const now = new Date();
    const groups = new Map();
    for (const s of slots) {
      const d = new Date(s.start);
      if (!showPast && d < now && s.status !== 'BOOKED') continue;
      const key = d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    return Array.from(groups.entries());
  }, [slots, showPast]);

  const counts = useMemo(() => {
    const c = { AVAILABLE: 0, LOCKED: 0, BOOKED: 0, CANCELLED: 0 };
    for (const s of slots) c[s.status] = (c[s.status] || 0) + 1;
    return c;
  }, [slots]);

  return (
    <div className="grid lg:grid-cols-2 gap-6 items-start">
      <div className="card space-y-4">
        <h2 className="font-semibold">Generate availability</h2>
        <select className="input" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
          <option value="">Select doctor</option>
          {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">From date</label>
            <input className="input" type="date" min={todayStr()} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="label">To date</label>
            <input className="input" type="date" min={fromDate || todayStr()} value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Days of week</label>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => toggleWeekday(w.key)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  weekdays.has(w.key) ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Start hour</label>
            <input className="input" type="number" min="0" max="23" value={startHour} onChange={(e) => setStartHour(e.target.value)} />
          </div>
          <div>
            <label className="label">End hour</label>
            <input className="input" type="number" min="1" max="24" value={endHour} onChange={(e) => setEndHour(e.target.value)} />
          </div>
          <div>
            <label className="label">Duration</label>
            <select className="input" value={duration} onChange={(e) => setDuration(e.target.value)}>
              {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={useBreak} onChange={(e) => setUseBreak(e.target.checked)} />
            Exclude a break window (e.g. lunch)
          </label>
          {useBreak && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Break start</label>
                <input className="input" type="number" min="0" max="23" value={breakStartHour} onChange={(e) => setBreakStartHour(e.target.value)} />
              </div>
              <div>
                <label className="label">Break end</label>
                <input className="input" type="number" min="1" max="24" value={breakEndHour} onChange={(e) => setBreakEndHour(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="label">Consultation type</label>
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="VIDEO">Video only</option>
            <option value="IN_CLINIC">In-clinic only</option>
            <option value="BOTH">Both (creates a video and a clinic slot per time)</option>
          </select>
        </div>

        {formError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</div>}

        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600">
          This will generate <span className="font-semibold text-slate-800">{plan.length}</span> slot{plan.length === 1 ? '' : 's'}
          {plan.length > 0 && ' (already-existing ones are skipped automatically)'}.
        </div>

        <button className="btn-primary w-full" disabled={!doctorId || plan.length === 0 || generating} onClick={generate}>
          {generating ? 'Generating...' : `Generate ${plan.length || ''} slot${plan.length === 1 ? '' : 's'}`}
        </button>
      </div>

      <div className="card !p-0">
        <div className="flex items-center justify-between flex-wrap gap-2 px-4 pt-4 pb-2">
          <h2 className="font-semibold">Slots {doctorId && `(${slots.length})`}</h2>
          {doctorId && (
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
              Show past
            </label>
          )}
        </div>

        {!doctorId ? (
          <p className="px-4 pb-4 text-sm text-slate-400">Select a doctor to see their slots.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 px-4 pb-3">
              {Object.entries(counts).map(([status, n]) => (
                <span key={status} className={`badge ${STATUS_STYLES[status]}`}>{status}: {n}</span>
              ))}
            </div>
            <div className="max-h-[30rem] overflow-y-auto px-4 pb-4 space-y-4">
              {slotsLoading ? (
                <p className="text-sm text-slate-400">Loading...</p>
              ) : groupedByDate.length === 0 ? (
                <p className="text-sm text-slate-400">No slots to show.</p>
              ) : (
                groupedByDate.map(([dateLabel, daySlots]) => (
                  <div key={dateLabel}>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{dateLabel}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {daySlots.map((s) => (
                        <div
                          key={s.id}
                          className={`group relative flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-lg border text-xs font-medium ${
                            s.status === 'AVAILABLE' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          <span>{new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="text-[10px] opacity-70">{s.mode === 'VIDEO' ? 'Video' : 'Clinic'}</span>
                          {s.status === 'AVAILABLE' ? (
                            <button
                              type="button"
                              disabled={cancellingId === s.id}
                              onClick={() => cancelSlot(s)}
                              title="Cancel this slot"
                              className="ml-0.5 h-4 w-4 rounded-full flex items-center justify-center text-emerald-400 hover:bg-red-100 hover:text-red-600 transition-colors disabled:opacity-40"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-2.5 w-2.5">
                                <path d="M18 6 6 18M6 6l12 12" />
                              </svg>
                            </button>
                          ) : (
                            <span className="text-[10px] opacity-70">&middot; {s.status}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
