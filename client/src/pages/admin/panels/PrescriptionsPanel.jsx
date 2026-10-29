import { useEffect, useState } from 'react';
import api, { apiErrorMessage } from '../../../api/client';
import PrescriptionModal from '../../../components/PrescriptionModal';
import { motion } from '../../../components/motion';
import { useToast } from '../../../components/Toast';
import { useConfirm } from '../../../components/ConfirmDialog';

export default function PrescriptionsPanel() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPrescription, setSelectedPrescription] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const toast = useToast();
  const confirm = useConfirm();

  const loadPrescriptions = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/prescriptions');
      if (res.data?.prescriptions && res.data.prescriptions.length > 0) {
        setPrescriptions(res.data.prescriptions);
      } else {
        const apptRes = await api.get('/admin/appointments');
        const list = (apptRes.data?.appointments || [])
          .filter((a) => !!a.prescription)
          .map((a) => ({
            id: a.prescription.id || a.id,
            appointmentId: a.id,
            medicines: a.prescription.medicines || [],
            notes: a.prescription.notes,
            fileUrl: a.prescription.fileUrl,
            createdAt: a.prescription.createdAt || a.createdAt,
            doctor: a.doctor,
            patient: a.patient,
            slot: a.slot,
            appointment: a,
          }));
        setPrescriptions(list);
      }
    } catch {
      try {
        const apptRes = await api.get('/admin/appointments');
        const list = (apptRes.data?.appointments || [])
          .filter((a) => !!a.prescription)
          .map((a) => ({
            id: a.prescription.id || a.id,
            appointmentId: a.id,
            medicines: a.prescription.medicines || [],
            notes: a.prescription.notes,
            fileUrl: a.prescription.fileUrl,
            createdAt: a.prescription.createdAt || a.createdAt,
            doctor: a.doctor,
            patient: a.patient,
            slot: a.slot,
            appointment: a,
          }));
        setPrescriptions(list);
      } catch {
        setPrescriptions([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrescriptions();
  }, []);

  const handleDelete = async (p) => {
    const rxId = p.id || p.appointmentId;
    const ok = await confirm({
      title: 'Permanently delete this prescription?',
      message: `Prescription for ${p.patient?.name || 'Patient'} issued by ${p.doctor?.name || 'Doctor'}.\n\nThis will permanently remove the digital prescription from the platform. This action cannot be undone.`,
      confirmLabel: 'Delete Prescription',
      danger: true,
    });
    if (!ok) return;

    setDeletingId(rxId);
    try {
      await api.delete(`/admin/prescriptions/${rxId}`);
      toast.success('Prescription deleted successfully.');
      await loadPrescriptions();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = prescriptions.filter((p) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    const patientName = p.patient?.name?.toLowerCase() || '';
    const doctorName = p.doctor?.name?.toLowerCase() || '';
    const medNames = (p.medicines || []).map((m) => (m.name || '').toLowerCase()).join(' ');
    const notes = (p.notes || '').toLowerCase();
    return patientName.includes(query) || doctorName.includes(query) || medNames.includes(query) || notes.includes(query);
  });

  return (
    <div className="card space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-[#CAA067] text-white flex items-center justify-center font-serif font-black text-lg shadow-xs">
            ℞
          </div>
          <div>
            <h2 className="font-bold text-slate-900 text-lg font-display">
              Prescription Registry ({prescriptions.length})
            </h2>
            <p className="text-xs text-slate-500">
              Audit, review, manage, and print official digital prescriptions issued across all consultations.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search patient, doctor, drug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input !w-64 text-xs"
          />
          <button
            type="button"
            onClick={loadPrescriptions}
            className="btn-secondary !px-3 !py-2 text-xs font-semibold cursor-pointer"
            title="Refresh Prescriptions"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-8 text-center text-slate-400 space-y-2">
          <div className="animate-spin text-2xl">⏳</div>
          <p className="text-sm">Loading prescriptions registry…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 space-y-3 bg-slate-50 rounded-2xl border border-slate-100 p-6">
          <div className="text-3xl">💊</div>
          <h3 className="font-bold text-slate-800 text-base">No Prescriptions Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {search ? 'No prescriptions matched your search query.' : 'Prescriptions generated by doctors during live teleconsultations will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[38rem] overflow-y-auto pr-1">
          {filtered.map((p, idx) => {
            const rxId = p.id || p.appointmentId;
            const isDeleting = deletingId === rxId;

            return (
              <motion.div
                key={rxId || idx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.03 }}
                className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-[#CAA067] transition-all shadow-2xs space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-slate-900 text-sm">
                        {p.patient?.name || 'Patient'}
                      </span>
                      {p.patient?.age && (
                        <span className="text-[11px] text-slate-400">
                          ({p.patient.age}y &middot; {p.patient.gender || 'Patient'})
                        </span>
                      )}
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                        Official Rx
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Consulted with <strong className="text-slate-700">{p.doctor?.name || 'Doctor'}</strong> ({p.doctor?.speciality || 'General Medicine'})
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <div className="text-right text-[11px] text-slate-400 hidden sm:block">
                      {new Date(p.createdAt).toLocaleDateString()} &middot; {new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedPrescription(
                          p.appointment || {
                            prescription: p,
                            doctor: p.doctor,
                            patient: p.patient,
                            slot: p.slot,
                            id: p.appointmentId,
                          }
                        )
                      }
                      className="btn-primary !px-3.5 !py-1.5 text-xs font-bold bg-[#CAA067] hover:bg-[#B88F55] text-white rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <span>℞</span>
                      <span>View &amp; Print</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(p)}
                      disabled={isDeleting}
                      className="btn-secondary !px-2.5 !py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 hover:border-red-300 border-red-200 rounded-xl flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40"
                      title="Permanently Delete Prescription"
                    >
                      <span>🗑️</span>
                      <span>{isDeleting ? '...' : 'Delete'}</span>
                    </button>
                  </div>
                </div>

                {/* Medicines Summary Chips */}
                <div className="space-y-1">
                  <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">
                    Prescribed Medications ({(p.medicines || []).length}):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(p.medicines || []).map((m, mIdx) => (
                      <span
                        key={mIdx}
                        className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 font-medium"
                      >
                        <strong className="text-slate-900">{m.name}</strong>{' '}
                        <span className="text-[#CAA067] font-semibold">{m.dosage}</span> &middot;{' '}
                        <span className="text-slate-500">{m.frequency}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Notes / Advice snippet */}
                {p.notes && (
                  <div className="text-xs text-slate-600 bg-amber-50/50 p-2.5 rounded-xl border border-amber-200/60 line-clamp-2">
                    <span className="font-bold text-amber-900">Advice:</span> {p.notes}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Official Medical Prescription Modal */}
      <PrescriptionModal
        isOpen={!!selectedPrescription}
        onClose={() => setSelectedPrescription(null)}
        appointment={selectedPrescription}
        doctor={selectedPrescription?.doctor}
        patient={selectedPrescription?.patient}
      />
    </div>
  );
}
