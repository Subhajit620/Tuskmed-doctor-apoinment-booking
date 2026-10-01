import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Reveal, StaggerGrid, StaggerItem } from '../../components/motion';
import PrescriptionModal from '../../components/PrescriptionModal';

const JOIN_WINDOW_MINUTES_BEFORE = 15;
const JOIN_WINDOW_MINUTES_AFTER = 120; // 2 hours

function canJoinNow(slotStart) {
  if (!slotStart) return false;
  const now = Date.now();
  const start = new Date(slotStart).getTime();
  const opensAt = start - JOIN_WINDOW_MINUTES_BEFORE * 60 * 1000;
  const closesAt = start + JOIN_WINDOW_MINUTES_AFTER * 60 * 1000;
  return now >= opensAt && now <= closesAt;
}

function isMeetingExpired(slotStart) {
  if (!slotStart) return false;
  const closesAt = new Date(slotStart).getTime() + JOIN_WINDOW_MINUTES_AFTER * 60 * 1000;
  return Date.now() > closesAt;
}

export default function PastAppointmentsAndPrescriptions() {
  const { activePatient } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'UPCOMING' | 'PRESCRIPTIONS' | 'REPORTS' | 'VIDEO' | 'IN_CLINIC'
  const [selectedPrescription, setSelectedPrescription] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!activePatient) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get('/appointments/mine')
      .then((res) => setAppointments(res.data.appointments || []))
      .catch(() => setAppointments([]))
      .finally(() => setLoading(false));
  }, [activePatient]);

  const filteredAppointments = appointments.filter((appt) => {
    if (filter === 'UPCOMING') return appt.status === 'CONFIRMED' || appt.status === 'PENDING';
    if (filter === 'PRESCRIPTIONS') return !!appt.prescription;
    if (filter === 'REPORTS') return !!appt.report || (appt.documents && appt.documents.length > 0);
    if (filter === 'VIDEO') return appt.mode === 'VIDEO';
    if (filter === 'IN_CLINIC') return appt.mode === 'IN_CLINIC';
    return true;
  });

  const printPrescription = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Reveal>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Appointments & Prescriptions</h1>
            <p className="text-slate-500 text-sm">
              Review your consultation history, join live video calls, and access digital prescriptions for{' '}
              <strong className="text-slate-700">{activePatient?.name || 'Active Patient'}</strong>.
            </p>
          </div>
          <Link to="/patient/doctors" className="btn-primary self-start sm:self-auto text-sm">
            Book New Consultation
          </Link>
        </div>
      </Reveal>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200">
        {[
          { key: 'ALL', label: `All Consultations (${appointments.length})` },
          { key: 'UPCOMING', label: `Upcoming / Active (${appointments.filter((a) => a.status === 'CONFIRMED' || a.status === 'PENDING').length})` },
          { key: 'PRESCRIPTIONS', label: `Prescriptions (${appointments.filter((a) => !!a.prescription).length})` },
          { key: 'REPORTS', label: `Reports & Docs (${appointments.filter((a) => !!a.report || a.documents?.length > 0).length})` },
          { key: 'VIDEO', label: 'Video Calls' },
          { key: 'IN_CLINIC', label: 'In-Clinic Visits' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3.5 py-2 text-sm font-semibold rounded-lg whitespace-nowrap transition-colors ${
              filter === tab.key
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card animate-pulse space-y-3 p-5">
              <div className="h-5 bg-slate-200 rounded w-1/3" />
              <div className="h-4 bg-slate-200 rounded w-1/4" />
              <div className="h-16 bg-slate-100 rounded w-full" />
            </div>
          ))}
        </div>
      ) : filteredAppointments.length === 0 ? (
        <div className="card text-center py-12 space-y-3">
          <div className="mx-auto h-14 w-14 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-800">No records found</h2>
          <p className="text-slate-500 text-sm">
            {filter !== 'ALL' ? 'No appointments match this filter.' : 'You have no past appointments or prescriptions yet.'}
          </p>
          <Link to="/patient/doctors" className="btn-primary inline-flex text-sm">
            Browse Doctors & Consult
          </Link>
        </div>
      ) : (
        <StaggerGrid className="space-y-4">
          {filteredAppointments.map((appt) => {
            const startDate = new Date(appt.slot?.start || appt.createdAt);
            const hasPrescription = !!appt.prescription;
            const hasReport = !!appt.report;
            const hasDocs = appt.documents && appt.documents.length > 0;

            return (
              <StaggerItem key={appt.id}>
                <div className="card hover:border-slate-300 transition-all p-5 space-y-4">
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center font-bold text-base shrink-0">
                        {appt.doctor?.name
                          ? appt.doctor.name
                              .split(' ')
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((p) => p[0])
                              .join('')
                          : 'DR'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-slate-900 text-lg">{appt.doctor?.name || 'Doctor'}</h3>
                          <span className="badge bg-slate-100 text-slate-700 text-xs font-medium">
                            {appt.doctor?.speciality || 'General Medicine'}
                          </span>
                          <span
                            className={`badge text-xs font-semibold ${
                              appt.status === 'COMPLETED'
                                ? 'bg-green-50 text-green-700'
                                : appt.status === 'CONFIRMED'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {appt.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {startDate.toLocaleDateString(undefined, {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          at {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &middot;{' '}
                          <span className="font-medium text-slate-700">{appt.mode === 'VIDEO' ? 'Video Consultation' : 'In-Clinic Visit'}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                      {appt.mode === 'VIDEO' && appt.status === 'CONFIRMED' && (
                        isMeetingExpired(appt.slot?.start) ? (
                          <span className="badge bg-slate-100 text-slate-500 text-xs py-1.5 px-3">
                            Time Over (2h limit)
                          </span>
                        ) : (
                          <Link
                            to={`/consultation/${appt.id}`}
                            className={`btn text-xs py-1.5 px-3 font-semibold flex items-center gap-1.5 rounded-lg transition-all ${
                              canJoinNow(appt.slot?.start)
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs animate-pulse ring-2 ring-emerald-300'
                                : 'bg-[#CAA067] hover:bg-[#B88F55] text-white shadow-xs'
                            }`}
                          >
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                            </span>
                            <span>{canJoinNow(appt.slot?.start) ? '🎥 Join Video Call' : '🎥 Join Call (Pre-Check)'}</span>
                          </Link>
                        )
                      )}
                      <button
                        onClick={() =>
                          navigate('/patient/book', {
                            state: { doctorId: appt.doctor?.id, specialityId: appt.doctor?.specialityId },
                          })
                        }
                        className="btn-secondary text-xs py-1.5 px-3 font-semibold hover:bg-brand-50 hover:text-brand-700"
                      >
                        Re-book Doctor
                      </button>
                      <Link
                        to={`/patient/appointments/${appt.id}/messages`}
                        className="btn-secondary text-xs py-1.5 px-3 font-semibold"
                      >
                        Messages
                      </Link>
                    </div>
                  </div>

                  {/* Symptoms & Diagnosis */}
                  {appt.symptoms && (
                    <div className="bg-slate-50 p-3 rounded-lg text-sm">
                      <span className="font-semibold text-slate-700">Reported Symptoms:</span>{' '}
                      <span className="text-slate-600">{appt.symptoms}</span>
                    </div>
                  )}

                  {/* Clinical Report / Diagnosis if any */}
                  {hasReport && (
                    <div className="bg-brand-50/50 border border-brand-100 p-3 rounded-lg text-sm space-y-1">
                      <div className="font-semibold text-brand-900 flex items-center gap-1.5">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-brand-600">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        </svg>
                        Doctor's Clinical Notes / Diagnosis:
                      </div>
                      <p className="text-slate-700 whitespace-pre-wrap text-xs sm:text-sm pl-5">{appt.report.content}</p>
                    </div>
                  )}

                  {/* Digital Prescription Preview Card */}
                  {hasPrescription ? (
                    <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-emerald-200/80">
                        <div className="flex items-center gap-2">
                          <span className="h-7 w-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-serif font-black text-sm">
                            ℞
                          </span>
                          <div>
                            <span className="font-bold text-emerald-950 text-sm">Digital Prescription Issued</span>
                            <span className="text-xs text-emerald-700 ml-2">
                              {(appt.prescription.medicines || []).length} Medicines Prescribed
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => setSelectedPrescription(appt)}
                          className="btn bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-1.5 px-3 self-start sm:self-auto shadow-sm flex items-center gap-1.5"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          View & Print Prescription
                        </button>
                      </div>

                      {/* Medicines quick preview */}
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {(appt.prescription.medicines || []).map((med, idx) => (
                          <div key={idx} className="bg-white border border-emerald-200/70 p-2.5 rounded-lg text-xs space-y-0.5">
                            <div className="font-bold text-slate-800">{med.name}</div>
                            <div className="text-emerald-700 font-medium">{med.dosage || 'Standard dose'}</div>
                            {med.frequency && <div className="text-slate-500">{med.frequency}</div>}
                          </div>
                        ))}
                      </div>

                      {appt.prescription.notes && (
                        <div className="text-xs text-emerald-800 italic pt-1">
                          <strong>Advice:</strong> {appt.prescription.notes}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 italic flex items-center gap-1.5">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      No prescription issued for this consultation.
                    </div>
                  )}

                  {/* Attached Documents */}
                  {hasDocs && (
                    <div className="pt-2">
                      <span className="text-xs font-semibold text-slate-500 block mb-1.5">Attached Reports & Files:</span>
                      <div className="flex flex-wrap gap-2">
                        {appt.documents.map((doc) => (
                          <a
                            key={doc.id}
                            href={doc.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                            </svg>
                            {doc.fileName}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </StaggerItem>
            );
          })}
        </StaggerGrid>
      )}

      {/* Standard Official Medical Prescription Modal */}
      <PrescriptionModal
        isOpen={!!selectedPrescription}
        onClose={() => setSelectedPrescription(null)}
        appointment={selectedPrescription}
        patient={activePatient}
      />
    </div>
  );
}
