import { useEffect, useState } from 'react';
import api, { apiErrorMessage } from '../../../api/client';
import { useToast } from '../../../components/Toast';
import { useConfirm } from '../../../components/ConfirmDialog';
import PrescriptionModal from '../../../components/PrescriptionModal';

const DELETABLE = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

export default function AppointmentsPanel() {
  const [appointments, setAppointments] = useState([]);
  const [status, setStatus] = useState('');
  const [selectedPrescription, setSelectedPrescription] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [clearing, setClearing] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const load = () =>
    api
      .get('/admin/appointments', { params: { status: status || undefined } })
      .then((res) => setAppointments(res.data.appointments || []))
      .catch(() => setAppointments([]));

  useEffect(() => {
    load();
  }, [status]);

  const cancel = async (id) => {
    const ok = await confirm({
      title: 'Cancel this appointment?',
      message: 'The patient will be notified and, if already paid, refunded automatically.',
      confirmLabel: 'Cancel appointment',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/admin/appointments/${id}/cancel`);
      toast.success('Appointment cancelled and slot released.');
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const removeOne = async (a) => {
    const when = new Date(a.slot.start).toLocaleString();
    const ok = await confirm({
      title: 'Permanently delete this appointment?',
      message: `${a.patient.name} with ${a.doctor.name} — ${when}\n\nThis also removes its report, prescription, documents and chat history. This cannot be undone.`,
      confirmLabel: 'Delete permanently',
      danger: true,
    });
    if (!ok) return;
    setBusyId(a.id);
    try {
      await api.delete(`/admin/appointments/${a.id}`);
      toast.success('Appointment history deleted.');
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const clearHistory = async () => {
    const scopeLabel = status ? `past ${status.toLowerCase()}` : 'all past completed/cancelled/no-show';
    const ok = await confirm({
      title: 'Clear past appointment history?',
      message: `This permanently deletes every ${scopeLabel} appointment, along with its reports, prescriptions, documents and chats.\n\nThis cannot be undone.`,
      confirmLabel: 'Clear history',
      danger: true,
    });
    if (!ok) return;
    setClearing(true);
    try {
      const res = await api.post('/admin/appointments/clear-history');
      await load();
      toast.success(`Removed ${res.data.deletedCount} past appointment${res.data.deletedCount === 1 ? '' : 's'}.`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-semibold text-slate-800">
          Appointments ({appointments.length})
        </h2>
        <div className="flex items-center gap-2">
          <select className="input !w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {['PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            className="text-xs font-semibold text-red-600 hover:text-red-700 border border-red-200 rounded-lg px-3 py-2 disabled:opacity-40 transition-colors"
            disabled={clearing}
            onClick={clearHistory}
            title="Permanently delete past completed/cancelled/no-show appointments"
          >
            {clearing ? 'Clearing…' : 'Clear past history'}
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-[36rem] overflow-y-auto">
        {appointments.length === 0 && <p className="text-sm text-slate-400 p-4 text-center">No appointments match this filter.</p>}
        {appointments.map((a) => (
          <div key={a.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2.5 pt-1 gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-800 truncate">
                {a.patient?.name || 'Patient'} <span className="text-slate-400 font-normal">with</span> {a.doctor?.name || 'Doctor'}
              </div>
              <div className="text-xs text-slate-400">
                {new Date(a.slot?.start || a.createdAt).toLocaleString()} &middot; {a.mode || 'VIDEO'} &middot; Ref: #{a.id?.slice(0, 8)}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
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

              <span
                className={`badge text-xs font-semibold ${
                  a.status === 'CONFIRMED'
                    ? 'bg-emerald-50 text-emerald-700'
                    : a.status === 'COMPLETED'
                    ? 'bg-slate-100 text-slate-700'
                    : a.status === 'PENDING_PAYMENT'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-red-50 text-red-600'
                }`}
              >
                {a.status}
              </span>

              {a.status === 'CONFIRMED' && (
                <button
                  className="text-red-600 text-xs font-medium hover:text-red-700 transition-colors"
                  onClick={() => cancel(a.id)}
                >
                  Cancel
                </button>
              )}

              {DELETABLE.includes(a.status) && (
                <button
                  className="text-slate-400 hover:text-red-600 text-xs font-medium disabled:opacity-40 transition-colors"
                  disabled={busyId === a.id}
                  onClick={() => removeOne(a)}
                  title="Permanently delete this appointment's history"
                >
                  {busyId === a.id ? 'Deleting…' : 'Delete'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Official Medical Prescription Modal */}
      <PrescriptionModal
        isOpen={!!selectedPrescription}
        onClose={() => setSelectedPrescription(null)}
        appointment={selectedPrescription}
      />
    </div>
  );
}
