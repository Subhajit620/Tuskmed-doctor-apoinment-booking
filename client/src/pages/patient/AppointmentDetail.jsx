import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/client';

export default function AppointmentDetail() {
  const { id } = useParams();
  const [appt, setAppt] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/appointments/${id}`).then((res) => setAppt(res.data.appointment)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-slate-400">Loading...</p>;
  if (!appt) return <p className="text-slate-400">Appointment not found.</p>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="card">
        <h1 className="text-xl font-bold">{appt.doctor.name}</h1>
        <p className="text-brand-600">{appt.doctor.speciality}</p>
        <p className="text-sm text-slate-500 mt-1">
          {new Date(appt.slot.start).toLocaleString()} &middot; {appt.mode === 'VIDEO' ? 'Video' : 'In-clinic'} &middot; {appt.status}
        </p>
        <p className="text-sm text-slate-500">Patient: {appt.patient.name}</p>
        {appt.symptoms && <p className="text-sm mt-2"><span className="font-medium">Symptoms:</span> {appt.symptoms}</p>}
        {appt.payment && (
          <p className="text-sm mt-2">
            <span className="font-medium">Payment:</span> ₹{Number(appt.payment.amount).toFixed(2)} ({appt.payment.status})
            {appt.payment.promoCode && ` — promo ${appt.payment.promoCode}`}
          </p>
        )}

        {appt.mode === 'VIDEO' && appt.status === 'CONFIRMED' && (
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-3">
            {Date.now() > new Date(appt.slot.start).getTime() + 120 * 60 * 1000 ? (
              <span className="badge bg-slate-100 text-slate-500 text-xs py-2 px-3.5">
                Meeting Time Over (2-hour limit ended)
              </span>
            ) : (
              <Link
                to={`/consultation/${appt.id}`}
                className="btn-primary inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                🎥 Join Video Consultation
              </Link>
            )}
          </div>
        )}
      </div>

      {appt.documents?.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-2">Uploaded documents</h2>
          <ul className="text-sm space-y-1">
            {appt.documents.map((d) => (
              <li key={d.id}><a className="text-brand-600" href={d.fileUrl} target="_blank" rel="noreferrer">{d.fileName}</a></li>
            ))}
          </ul>
        </div>
      )}

      {appt.report && (
        <div className="card">
          <h2 className="font-semibold mb-2">Report</h2>
          <p className="text-sm whitespace-pre-wrap">{appt.report.content}</p>
        </div>
      )}

      {appt.prescription && (
        <div className="card">
          <h2 className="font-semibold mb-2">Prescription</h2>
          <ul className="text-sm space-y-1 list-disc pl-5">
            {(appt.prescription.medicines || []).map((m, i) => (
              <li key={i}>{m.name} — {m.dosage} {m.frequency ? `(${m.frequency})` : ''}</li>
            ))}
          </ul>
          {appt.prescription.notes && <p className="text-sm text-slate-500 mt-2">{appt.prescription.notes}</p>}
        </div>
      )}
    </div>
  );
}
