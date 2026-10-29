import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { apiErrorMessage } from '../../api/client';
import { motion, Skeleton, StaggerGrid, StaggerItem } from '../../components/motion';
import { useToast } from '../../components/Toast';

const AVATAR_GRADIENTS = [
  'from-brand-400 to-brand-600',
  'from-amber-400 to-amber-600',
  'from-sky-400 to-sky-600',
  'from-rose-400 to-rose-600',
  'from-violet-400 to-violet-600',
  'from-emerald-400 to-emerald-600',
];

function initialsOf(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '?';
}

function gradientFor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[Math.abs(hash)];
}

export default function DoctorPatients() {
  const [patients, setPatients] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    api.get('/doctor/patients').then((res) => setPatients(res.data.patients)).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return patients;
    return patients.filter((p) => p.name.toLowerCase().includes(needle));
  }, [patients, q]);

  // The patient list doesn't carry appointment data, so resolve the right
  // visit to attach the prescription to on demand: the most recent visit
  // without one yet, falling back to the most recent visit overall.
  const writePrescription = async (patient) => {
    setResolvingId(patient.id);
    try {
      const res = await api.get(`/doctor/patients/${patient.id}`);
      const target = res.data.appointments.find((a) => !a.prescription) || res.data.appointments[0];
      if (!target) {
        toast.error('No visits found for this patient yet.');
        return;
      }
      navigate(`/doctor/appointments/${target.id}#prescription`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Your Patients</h1>
        <input
          className="input max-w-xs"
          placeholder="Search by name..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="card space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-8 w-full rounded-lg mt-1" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-400">{patients.length === 0 ? 'No patients yet.' : 'No patients match that search.'}</p>
      ) : (
        <StaggerGrid className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {filtered.map((p) => (
            <StaggerItem key={p.id}>
              <motion.div
                whileHover={{ y: -5, scale: 1.02 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="card h-full flex flex-col items-start gap-2 hover:shadow-elevated transition-shadow"
              >
                <div className={`h-11 w-11 rounded-full bg-gradient-to-br ${gradientFor(p.id)} text-white flex items-center justify-center font-display font-bold text-sm shadow-xs`}>
                  {initialsOf(p.name)}
                </div>
                <div className="font-medium">{p.name}</div>
                <div className="text-sm text-slate-500">{p.age} &middot; {p.gender}</div>
                <div className="w-full flex flex-col gap-1.5 mt-1">
                  <Link to={`/doctor/patients/${p.id}`} className="btn-secondary !px-3 !py-1.5 text-sm w-full text-center">
                    View Details
                  </Link>
                  <button
                    type="button"
                    disabled={resolvingId === p.id}
                    onClick={() => writePrescription(p)}
                    className="btn-primary !px-3 !py-1.5 text-sm w-full text-center disabled:opacity-60"
                  >
                    {resolvingId === p.id ? 'Opening...' : 'Write Prescription'}
                  </button>
                </div>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerGrid>
      )}
    </div>
  );
}
