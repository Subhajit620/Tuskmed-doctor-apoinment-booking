import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/client';

export default function DoctorPatientDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/doctor/patients/${id}`).then((res) => setData(res.data)).catch(() => setError('Could not load this patient.'));
  }, [id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-slate-400">Loading...</p>;

  const { patient, appointments, prescriptions, reports, documents } = data;

  // Prefer the most recent visit that doesn't have a prescription yet;
  // if every visit already has one, default to the most recent visit
  // (writing there will update/replace its existing prescription).
  const prescriptionTarget = appointments.find((a) => !a.prescription) || appointments[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link to="/doctor/patients" className="text-sm text-brand-600 hover:underline">&larr; Back to Your Patients</Link>
        {prescriptionTarget && (
          <Link to={`/doctor/appointments/${prescriptionTarget.id}#prescription`} className="btn-primary !px-4 !py-2 text-sm">
            + Write New Prescription
          </Link>
        )}
      </div>

      <div className="card">
        <h1 className="text-xl font-bold">{patient.name}</h1>
        <p className="text-sm text-slate-500">{patient.age} years &middot; {patient.gender}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-sm">
          {patient.mobile && <div><span className="text-slate-400">Mobile:</span> {patient.mobile}</div>}
          {patient.email && <div><span className="text-slate-400">Email:</span> {patient.email}</div>}
          {patient.city && <div><span className="text-slate-400">City:</span> {patient.city}</div>}
          {patient.state && <div><span className="text-slate-400">State:</span> {patient.state}</div>}
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Consultation history with you</h2>
        {appointments.length === 0 ? (
          <p className="text-sm text-slate-400">No visits yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {appointments.map((a) => (
              <div key={a.id} className="py-2 flex items-center justify-between text-sm flex-wrap gap-2">
                <div>
                  {new Date(a.slot.start).toLocaleString()} &middot; {a.mode === 'VIDEO' ? 'Video' : 'Clinic'}
                  {a.isFollowUp && <span className="badge bg-amber-100 text-amber-700 ml-2">Follow-Up</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="badge bg-slate-100 text-slate-600">{a.status}</span>
                  <Link to={`/doctor/appointments/${a.id}#prescription`} className="text-brand-600 font-medium hover:underline whitespace-nowrap">
                    {a.prescription ? 'Edit Prescription' : 'Write Prescription'}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Prescriptions</h2>
        {prescriptions.length === 0 ? (
          <p className="text-sm text-slate-400">No prescriptions issued yet.</p>
        ) : (
          prescriptions.map((p) => (
            <div key={p.appointmentId} className="border border-slate-100 rounded-lg p-3 text-sm">
              <div className="text-slate-400 mb-1">{new Date(p.date).toLocaleDateString()}</div>
              <ul className="list-disc list-inside">
                {(p.medicines || []).map((m, i) => <li key={i}>{m.name} &middot; {m.dosage} &middot; {m.frequency}</li>)}
              </ul>
              {p.notes && <p className="text-slate-500 mt-1">{p.notes}</p>}
            </div>
          ))
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Reports &amp; notes</h2>
        {reports.length === 0 ? (
          <p className="text-sm text-slate-400">No reports on file yet.</p>
        ) : (
          reports.map((r) => (
            <div key={r.appointmentId} className="border border-slate-100 rounded-lg p-3 text-sm">
              <div className="text-slate-400 mb-1">{new Date(r.date).toLocaleDateString()}</div>
              <p>{r.content}</p>
            </div>
          ))
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Uploaded documents</h2>
        {documents.length === 0 ? (
          <p className="text-sm text-slate-400">No documents uploaded.</p>
        ) : (
          <ul className="list-disc list-inside text-sm">
            {documents.map((d) => (
              <li key={d.id}>
                <a className="text-brand-600 hover:underline" href={d.fileUrl} target="_blank" rel="noreferrer">{d.fileName}</a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
