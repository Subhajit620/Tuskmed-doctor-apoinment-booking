import { useEffect, useState } from 'react';
import api, { apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const GENDERS = ['MALE', 'FEMALE', 'OTHER'];
const emptyForm = { name: '', mobile: '', email: '', dob: '', gender: 'OTHER', state: '', city: '' };

export default function Patients() {
  const { account, patients, setPatients, switchActivePatient } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const todayStr = new Date().toISOString().slice(0, 10);

  const refreshList = async (q) => {
    const res = await api.get('/patients', { params: q ? { q } : {} });
    setPatients(res.data.patients);
  };

  useEffect(() => {
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = async (e) => {
    const q = e.target.value;
    setSearch(q);
    await refreshList(q);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api.post('/patients', form);
      setPatients((prev) => [...prev, res.data.patient]);
      if (!account?.activePatientId) await switchActivePatient(res.data.patient.id);
      setForm(emptyForm);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Register a family member</h2>
        {error && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Full name *</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Mobile</label>
              <input className="input" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date of birth *</label>
              <input
                className="input"
                type="date"
                required
                max={todayStr}
                value={form.dob}
                onChange={(e) => setForm({ ...form, dob: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Gender *</label>
              <select className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>{g.charAt(0) + g.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">State</label>
              <input className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
            <div>
              <label className="label">City</label>
              <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
          </div>
          <button className="btn-primary w-full" disabled={busy || !form.name || !form.dob}>Add patient</button>
        </form>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Switch active patient</h2>
        <input className="input mb-3" placeholder="Search patients..." value={search} onChange={onSearch} />
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {patients.length === 0 && <p className="text-sm text-slate-400">No patient profiles yet.</p>}
          {patients.map((p) => (
            <button
              key={p.id}
              onClick={() => switchActivePatient(p.id)}
              className={`w-full text-left px-3 py-2 rounded-lg border flex items-center justify-between ${
                account?.activePatientId === p.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>
                <span className="font-medium">{p.name}</span>
                <span className="text-slate-400 text-sm ml-2">
                  {p.age} yrs &middot; {p.gender.charAt(0) + p.gender.slice(1).toLowerCase()}
                </span>
              </span>
              {account?.activePatientId === p.id && <span className="badge bg-brand-500 text-white">Active</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
