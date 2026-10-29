import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { Skeleton, StaggerGrid, StaggerItem } from '../../components/motion';

export default function Doctors() {
  const [specialities, setSpecialities] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [specialityId, setSpecialityId] = useState('');
  const [q, setQ] = useState('');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/specialities').then((res) => setSpecialities(res.data.specialities));
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .get('/doctors', { params: { specialityId: specialityId || undefined, q: q || undefined, availableOnly: availableOnly || undefined } })
      .then((res) => setDoctors(res.data.doctors))
      .finally(() => setLoading(false));
  }, [specialityId, q, availableOnly]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Our Doctors</h1>
        <p className="text-slate-500">Browse by speciality or search by name.</p>
      </div>

      <div className="card flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="label">Search</label>
          <input className="input" placeholder="Doctor name..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="min-w-[200px]">
          <label className="label">Speciality</label>
          <select className="input" value={specialityId} onChange={(e) => setSpecialityId(e.target.value)}>
            <option value="">All specialities</option>
            {specialities.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm mb-2">
          <input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} />
          Available now only
        </label>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="card space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-5 w-10 rounded-full" />
              </div>
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-9 w-full rounded-lg mt-2" />
            </div>
          ))}
        </div>
      ) : doctors.length === 0 ? (
        <p className="text-slate-400">No doctors match your filters.</p>
      ) : (
        <StaggerGrid className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {doctors.map((d) => (
            <StaggerItem key={d.id}>
              <div className="card h-full flex flex-col gap-2 hover:shadow-elevated hover:-translate-y-0.5 transition-all">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-lg">{d.name}</div>
                  <div className="badge bg-amber-50 text-amber-700">★ {d.rating}</div>
                </div>
                <div className="text-sm text-brand-600 font-medium">{d.speciality}</div>
                <div className="text-sm text-slate-500">{d.experienceYrs} yrs experience &middot; Reg. {d.registrationNo || 'N/A'}</div>
                <div className="text-sm text-slate-500">Languages: {(d.languages || []).join(', ') || '—'}</div>
                <div className="text-sm font-medium">Fee: ₹{Number(d.fee).toFixed(0)}</div>
                <div className="text-xs text-slate-500">
                  {d.nextAvailableSlot
                    ? `Next slot: ${new Date(d.nextAvailableSlot.start).toLocaleString()} (${d.nextAvailableSlot.mode === 'VIDEO' ? 'Video' : 'In-clinic'})`
                    : 'No upcoming availability'}
                </div>
                <button
                  className="btn-primary mt-2"
                  onClick={() => navigate('/patient/book', { state: { doctorId: d.id, specialityId: d.specialityId } })}
                >
                  Book Appointment
                </button>
              </div>
            </StaggerItem>
          ))}
        </StaggerGrid>
      )}
    </div>
  );
}
