import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import api, { apiErrorMessage } from '../../api/client';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/ConfirmDialog';
import { Reveal } from '../../components/motion';

const EMPTY_MEDICINE = { name: '', dosage: '', frequency: '', duration: '', instructions: '' };

// Common defaults so a doctor can mostly click instead of type - not a
// clinical database, just fast-entry suggestions via <datalist>.
const COMMON_MEDICINES = [
  'Paracetamol', 'Amoxicillin', 'Azithromycin', 'Ibuprofen', 'Cetirizine',
  'Metformin', 'Amlodipine', 'Atorvastatin', 'Pantoprazole', 'Vitamin D3',
  'Omeprazole', 'Losartan', 'Levothyroxine', 'Ors Sachet', 'Multivitamin',
];
const COMMON_FREQUENCIES = ['Once daily', 'Twice daily', 'Thrice daily', 'Every 6 hours', 'Every 8 hours', 'At bedtime', 'As needed'];
const COMMON_DURATIONS = ['3 days', '5 days', '7 days', '10 days', '14 days', '1 month', 'Ongoing'];
const COMMON_INSTRUCTIONS = ['After food', 'Before food', 'With water', 'Empty stomach', 'Avoid alcohol'];

function isMedicineFilled(m) {
  return m.name.trim() || m.dosage.trim() || m.frequency.trim() || m.duration.trim() || m.instructions.trim();
}

/** Read-only, print-friendly rendition of the prescription being drafted. */
function PrescriptionPreview({ doctor, patient, appt, medicines, notes }) {
  const filled = medicines.filter(isMedicineFilled);
  return (
    <div id="prescription-print-area" className="bg-white text-slate-900 p-6 rounded-xl border border-slate-200 space-y-5 text-sm">
      <div className="flex items-start justify-between border-b border-slate-200 pb-3">
        <div>
          <div className="font-display font-bold text-lg">{doctor?.name || 'Doctor'}</div>
          <div className="text-slate-500">{doctor?.speciality}</div>
          {doctor?.registrationNo && <div className="text-slate-400 text-xs">Reg. No. {doctor.registrationNo}</div>}
        </div>
        <div className="text-right text-slate-500">
          <div className="font-semibold text-slate-700">TuskMed Teleconsult</div>
          <div>{new Date(appt.slot.start).toLocaleDateString()}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
        <div><span className="text-slate-400">Patient:</span> {patient?.name || appt.patient.name}</div>
        {patient?.age != null && <div><span className="text-slate-400">Age:</span> {patient.age}</div>}
        {patient?.gender && <div><span className="text-slate-400">Gender:</span> {patient.gender}</div>}
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">&#8478; Medicines</div>
        {filled.length === 0 ? (
          <p className="text-slate-400 italic">No medicines added yet.</p>
        ) : (
          <table className="w-full">
            <thead className="text-left text-slate-400 text-xs">
              <tr>
                <th className="py-1 pr-2 font-medium">Medicine</th>
                <th className="py-1 pr-2 font-medium">Dosage</th>
                <th className="py-1 pr-2 font-medium">Frequency</th>
                <th className="py-1 pr-2 font-medium">Duration</th>
                <th className="py-1 font-medium">Instructions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filled.map((m, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-2 font-medium">{m.name || '—'}</td>
                  <td className="py-1.5 pr-2">{m.dosage || '—'}</td>
                  <td className="py-1.5 pr-2">{m.frequency || '—'}</td>
                  <td className="py-1.5 pr-2">{m.duration || '—'}</td>
                  <td className="py-1.5">{m.instructions || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {notes.trim() && (
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Notes</div>
          <p className="whitespace-pre-wrap">{notes}</p>
        </div>
      )}

      <div className="pt-8 flex justify-end">
        <div className="text-center">
          <div className="border-t border-slate-300 w-40 pt-1 text-xs text-slate-400">Doctor&apos;s signature</div>
        </div>
      </div>
    </div>
  );
}

export default function DoctorAppointmentDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const prescriptionCardRef = useRef(null);
  const [highlightRx, setHighlightRx] = useState(false);
  const [appt, setAppt] = useState(null);
  const [doctorProfile, setDoctorProfile] = useState(null);
  const [patient, setPatient] = useState(null);
  const [lastPrescription, setLastPrescription] = useState(null);
  const [reportContent, setReportContent] = useState('');
  const [medicines, setMedicines] = useState([{ ...EMPTY_MEDICINE }]);
  const [notes, setNotes] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [savingRx, setSavingRx] = useState(false);
  const [completing, setCompleting] = useState(false);

  const load = () =>
    api.get('/doctor/appointments', { params: {} }).then((res) => {
      const found = res.data.appointments.find((a) => a.id === id);
      setAppt(found || null);
      setReportContent(found?.report?.content || '');
      if (found?.prescription?.medicines?.length) {
        setMedicines(found.prescription.medicines.map((m) => ({ ...EMPTY_MEDICINE, ...m })));
      }
      setNotes(found?.prescription?.notes || '');
      return found;
    });

  useEffect(() => {
    load().then((found) => {
      if (!found) return;
      api.get('/doctor/summary').then((res) => setDoctorProfile(res.data.profile));
      api.get(`/doctor/patients/${found.patient.id}`).then((res) => {
        setPatient(res.data.patient);
        const prior = res.data.prescriptions
          .filter((p) => p.appointmentId !== id)
          .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        setLastPrescription(prior || null);
      }).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Arriving via a "Write/Edit Prescription" link (from the patient page or
  // dashboard) carries a #prescription hash - jump straight to that card
  // and flash it so it's obvious where to look.
  useEffect(() => {
    if (!appt || location.hash !== '#prescription' || !prescriptionCardRef.current) return;
    prescriptionCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setHighlightRx(true);
    const t = setTimeout(() => setHighlightRx(false), 2000);
    return () => clearTimeout(t);
  }, [appt, location.hash]);

  const hasDraftContent = useMemo(() => medicines.some(isMedicineFilled) || notes.trim(), [medicines, notes]);

  const copyFromLastPrescription = async () => {
    if (hasDraftContent) {
      const ok = await confirm({
        title: 'Replace the current draft?',
        message: 'This will overwrite the medicines and notes you’ve already entered with the patient’s last prescription.',
        confirmLabel: 'Replace draft',
        danger: true,
      });
      if (!ok) return;
    }
    setMedicines(lastPrescription.medicines.map((m) => ({ ...EMPTY_MEDICINE, ...m })));
    setNotes(lastPrescription.notes || '');
    toast.success(`Copied prescription from ${new Date(lastPrescription.date).toLocaleDateString()}.`);
  };

  const saveReport = async () => {
    setSavingReport(true);
    try {
      await api.post(`/doctor/appointments/${id}/report`, { content: reportContent });
      toast.success('Report saved.');
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSavingReport(false);
    }
  };

  const updateMedicine = (i, field, value) => {
    const next = [...medicines];
    next[i] = { ...next[i], [field]: value };
    setMedicines(next);
  };

  const removeMedicine = (i) => setMedicines(medicines.filter((_, idx) => idx !== i));

  const savePrescription = async () => {
    setSavingRx(true);
    try {
      await api.post(`/doctor/appointments/${id}/prescription`, {
        medicines: medicines.filter(isMedicineFilled),
        notes,
      });
      toast.success('Prescription sent to the patient.');
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSavingRx(false);
    }
  };

  const printPrescription = () => {
    setShowPreview(true);
    // Let the preview render before the print dialog opens.
    setTimeout(() => window.print(), 50);
  };

  const completeAppointment = async () => {
    const ok = await confirm({
      title: 'Mark this appointment as completed?',
      message: 'This closes out the visit. You can still add or edit the report and prescription afterwards.',
      confirmLabel: 'Mark completed',
    });
    if (!ok) return;
    setCompleting(true);
    try {
      await api.post(`/doctor/appointments/${id}/complete`);
      toast.success('Appointment marked completed.');
      navigate('/doctor');
    } catch (err) {
      toast.error(apiErrorMessage(err));
      setCompleting(false);
    }
  };

  const [actionBusy, setActionBusy] = useState(false);

  const handleAccept = async () => {
    setActionBusy(true);
    try {
      const res = await api.post(`/doctor/appointments/${id}/accept`);
      toast.success(res.data.message || 'Appointment accepted & consultation room ready!');
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setActionBusy(false);
    }
  };

  const handleReject = async () => {
    const ok = await confirm({
      title: 'Reject this appointment request?',
      message: 'This will cancel the booking, release the time slot, and trigger a refund.',
      confirmLabel: 'Reject Request',
      danger: true,
    });
    if (!ok) return;

    setActionBusy(true);
    try {
      const res = await api.post(`/doctor/appointments/${id}/reject`, { reason: 'Doctor unavailable' });
      toast.success(res.data.message || 'Appointment rejected.');
      navigate('/doctor');
    } catch (err) {
      toast.error(apiErrorMessage(err));
      setActionBusy(false);
    }
  };

  if (!appt) return <p className="text-slate-400">Loading...</p>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="print:hidden">
        <Link to="/doctor" className="text-sm text-brand-600 hover:underline">&larr; Back to Dashboard</Link>
      </div>

      <div className="card print:hidden">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold">{appt.patient.name}</h1>
            <p className="text-sm text-slate-500">
              {new Date(appt.slot.start).toLocaleString()} &middot; {appt.mode === 'VIDEO' ? 'Video consultation' : 'In-clinic visit'}
            </p>
          </div>
          <span className={`badge ${
            appt.status === 'CONFIRMED'
              ? 'bg-emerald-50 text-emerald-700'
              : appt.status === 'PENDING'
              ? 'bg-amber-50 text-amber-700'
              : appt.status === 'COMPLETED'
              ? 'bg-slate-100 text-slate-600'
              : 'bg-red-50 text-red-600'
          }`}>
            {appt.status}
          </span>
        </div>
        {appt.symptoms && <p className="text-sm mt-2"><span className="font-medium">Symptoms:</span> {appt.symptoms}</p>}

        {appt.status === 'PENDING' && (
          <div className="mt-4 p-3 bg-amber-50/70 border border-amber-200 rounded-lg flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-sm font-semibold text-amber-900">Incoming Booking Request</div>
              <div className="text-xs text-amber-700">Accept to generate a secure video consultation room and notify the patient.</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAccept}
                disabled={actionBusy}
                className="btn-primary !px-4 !py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 border-emerald-600"
              >
                {actionBusy ? 'Processing...' : 'Accept Appointment'}
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={actionBusy}
                className="btn-secondary !px-4 !py-1.5 text-xs text-red-600 hover:bg-red-50 border-red-200"
              >
                Reject
              </button>
            </div>
          </div>
        )}

        {appt.status === 'CONFIRMED' && appt.mode === 'VIDEO' && (
          <div className="mt-4">
            <Link to={`/consultation/${appt.id}`} className="btn-primary inline-flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Join Consultation Room
            </Link>
          </div>
        )}
      </div>

      <div className="card space-y-3 print:hidden">
        <h2 className="font-semibold">Report</h2>
        <textarea
          className="input"
          rows={4}
          placeholder="Clinical notes, findings, follow-up plan..."
          value={reportContent}
          onChange={(e) => setReportContent(e.target.value)}
        />
        <button className="btn-secondary" disabled={savingReport || !reportContent.trim()} onClick={saveReport}>
          {savingReport ? 'Saving...' : 'Save report'}
        </button>
      </div>

      <div
        id="prescription"
        ref={prescriptionCardRef}
        className={`card space-y-3 print:hidden transition-shadow duration-500 ${highlightRx ? 'ring-2 ring-brand-400 shadow-elevated' : ''}`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold">Prescription</h2>
          {lastPrescription && (
            <button type="button" className="text-xs font-medium text-brand-600 hover:text-brand-700" onClick={copyFromLastPrescription}>
              Copy from last prescription ({new Date(lastPrescription.date).toLocaleDateString()})
            </button>
          )}
        </div>

        {medicines.map((m, i) => (
          <div key={i} className="rounded-lg border border-slate-100 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
                <input
                  className="input"
                  list="tuskmed-medicine-names"
                  placeholder="Medicine"
                  value={m.name}
                  onChange={(e) => updateMedicine(i, 'name', e.target.value)}
                />
                <input className="input" placeholder="Dosage (e.g. 500mg)" value={m.dosage} onChange={(e) => updateMedicine(i, 'dosage', e.target.value)} />
              </div>
              {medicines.length > 1 && (
                <button
                  type="button"
                  className="text-slate-400 hover:text-red-600 shrink-0 p-1"
                  title="Remove this medicine"
                  onClick={() => removeMedicine(i)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input className="input" list="tuskmed-frequencies" placeholder="Frequency" value={m.frequency} onChange={(e) => updateMedicine(i, 'frequency', e.target.value)} />
              <input className="input" list="tuskmed-durations" placeholder="Duration" value={m.duration} onChange={(e) => updateMedicine(i, 'duration', e.target.value)} />
              <input className="input" list="tuskmed-instructions" placeholder="Instructions" value={m.instructions} onChange={(e) => updateMedicine(i, 'instructions', e.target.value)} />
            </div>
          </div>
        ))}
        <datalist id="tuskmed-medicine-names">{COMMON_MEDICINES.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="tuskmed-frequencies">{COMMON_FREQUENCIES.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="tuskmed-durations">{COMMON_DURATIONS.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="tuskmed-instructions">{COMMON_INSTRUCTIONS.map((v) => <option key={v} value={v} />)}</datalist>

        <button className="text-sm text-brand-600 font-medium" onClick={() => setMedicines([...medicines, { ...EMPTY_MEDICINE }])}>
          + Add medicine
        </button>
        <textarea className="input" rows={2} placeholder="Notes for the patient" value={notes} onChange={(e) => setNotes(e.target.value)} />

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button className="btn-secondary" disabled={savingRx} onClick={savePrescription}>
            {savingRx ? 'Sending...' : appt.prescription ? 'Update prescription' : 'Save prescription'}
          </button>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-700 font-medium" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? 'Hide preview' : 'Preview'}
          </button>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-700 font-medium" onClick={printPrescription}>
            Print
          </button>
          {appt.prescription && <span className="badge bg-emerald-100 text-emerald-700 ml-auto">&#10003; Sent to patient</span>}
        </div>
      </div>

      {showPreview && (
        <Reveal className="print:contents">
          <PrescriptionPreview doctor={doctorProfile} patient={patient} appt={appt} medicines={medicines} notes={notes} />
        </Reveal>
      )}
      {/* Kept off-screen (not unmounted) so the Print button works even when the preview panel is collapsed. */}
      {!showPreview && (
        <div className="hidden print:block">
          <PrescriptionPreview doctor={doctorProfile} patient={patient} appt={appt} medicines={medicines} notes={notes} />
        </div>
      )}

      {appt.status !== 'COMPLETED' && (
        <button className="btn-primary w-full print:hidden" disabled={completing} onClick={completeAppointment}>
          {completing ? 'Marking completed...' : 'Mark appointment as completed'}
        </button>
      )}
    </div>
  );
}
