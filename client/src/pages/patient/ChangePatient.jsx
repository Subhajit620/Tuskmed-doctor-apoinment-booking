import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import { Reveal, StaggerGrid, StaggerItem } from '../../components/motion';

export default function ChangePatient() {
  const { account, patients, setPatients, activePatient, switchActivePatient } = useAuth();
  const [search, setSearch] = useState('');
  const [switchingId, setSwitchingId] = useState(null);
  const [feedback, setFeedback] = useState('');
  const navigate = useNavigate();

  const refreshList = async (query = '') => {
    try {
      const res = await api.get('/patients', { params: query ? { q: query } : {} });
      setPatients(res.data.patients);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    refreshList(search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleSwitch = async (patientId) => {
    if (patientId === activePatient?.id) return;
    setSwitchingId(patientId);
    setFeedback('');
    try {
      await switchActivePatient(patientId);
      const selected = patients.find((p) => p.id === patientId);
      setFeedback(`Active patient changed to ${selected?.name || 'selected profile'}`);
      setTimeout(() => setFeedback(''), 4000);
    } catch (e) {
      // ignore
    } finally {
      setSwitchingId(null);
    }
  };

  const filteredPatients = patients.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.city && p.city.toLowerCase().includes(search.toLowerCase())) ||
    (p.mobile && p.mobile.includes(search))
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Reveal>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Change Patient</h1>
            <p className="text-slate-500 text-sm">
              Switch between family profiles to manage appointments, vitals, medical records, and messages.
            </p>
          </div>
          <Link
            to="/patient/register-patient"
            className="btn-primary inline-flex items-center gap-2 self-start sm:self-auto text-sm"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Register New Patient
          </Link>
        </div>
      </Reveal>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold">✓</span>
            <span>{feedback}</span>
          </div>
          <button
            onClick={() => navigate('/patient')}
            className="text-xs font-semibold text-green-800 underline hover:no-underline"
          >
            Go to Dashboard &rarr;
          </button>
        </div>
      )}

      {/* Current Active Patient Highlight Card */}
      {activePatient && (
        <div className="card bg-gradient-to-br from-brand-600 to-brand-700 text-white p-6 shadow-elevated">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-white/15 backdrop-blur border border-white/20 text-white flex items-center justify-center font-display font-bold text-2xl">
                {activePatient.name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="bg-white/20 text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    Currently Active
                  </span>
                </div>
                <h2 className="text-2xl font-bold">{activePatient.name}</h2>
                <p className="text-brand-100 text-sm">
                  {activePatient.age !== undefined ? `${activePatient.age} years old` : ''} &middot;{' '}
                  {activePatient.gender?.toLowerCase()} &middot;{' '}
                  {activePatient.city ? `${activePatient.city}, ${activePatient.state || ''}` : 'Location unassigned'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-stretch md:self-auto">
              <Link
                to="/patient/personal-info"
                className="btn bg-white text-brand-700 hover:bg-brand-50 text-sm font-semibold shadow-sm flex-1 md:flex-initial text-center"
              >
                View Profile
              </Link>
              <Link
                to="/patient/doctors"
                className="btn bg-brand-800/60 hover:bg-brand-800 text-white text-sm font-semibold border border-white/20 flex-1 md:flex-initial text-center"
              >
                Book Visit
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Search & Patient Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-semibold text-lg text-slate-900">Registered Family Profiles ({patients.length})</h2>
          <div className="w-64 max-w-full">
            <input
              type="text"
              className="input text-sm py-1.5"
              placeholder="Search by name, city, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filteredPatients.length === 0 ? (
          <div className="card text-center py-12 space-y-3">
            <p className="text-slate-500">No patient profiles match your search.</p>
            <Link to="/patient/register-patient" className="btn-primary inline-flex text-sm">
              Register New Family Member
            </Link>
          </div>
        ) : (
          <StaggerGrid className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPatients.map((p) => {
              const isActive = activePatient?.id === p.id;
              const isSwitching = switchingId === p.id;
              const initials = p.name.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

              return (
                <StaggerItem key={p.id}>
                  <div
                    className={`card h-full flex flex-col justify-between transition-all ${
                      isActive
                        ? 'ring-2 ring-brand-500 bg-brand-50/40 border-brand-200'
                        : 'hover:shadow-card hover:border-slate-300'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-11 w-11 rounded-xl flex items-center justify-center font-bold text-sm ${
                              isActive ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {initials}
                          </div>
                          <div>
                            <h3 className="font-semibold text-slate-900 leading-tight">{p.name}</h3>
                            <span className="text-xs text-slate-500 capitalize">
                              {p.age !== undefined ? `${p.age} yrs` : '—'} &middot; {p.gender?.toLowerCase()}
                            </span>
                          </div>
                        </div>

                        {isActive && (
                          <span className="badge bg-brand-500 text-white font-semibold text-[11px]">Active</span>
                        )}
                      </div>

                      <div className="text-xs text-slate-500 space-y-1 bg-slate-50 p-2.5 rounded-lg">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Mobile:</span>
                          <span className="font-medium text-slate-700">{p.mobile || '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Location:</span>
                          <span className="font-medium text-slate-700">{p.city ? `${p.city}, ${p.state || ''}` : '—'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 flex items-center gap-2">
                      {isActive ? (
                        <div className="w-full flex items-center justify-between text-xs text-brand-700 font-medium bg-brand-100/60 px-3 py-2 rounded-lg">
                          <span>✓ Active Patient</span>
                          <Link to="/patient/personal-info" className="underline font-bold">Edit Info</Link>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleSwitch(p.id)}
                          disabled={isSwitching}
                          className="btn-secondary w-full text-xs py-2 font-semibold hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200"
                        >
                          {isSwitching ? 'Switching...' : 'Switch to this Patient'}
                        </button>
                      )}
                    </div>
                  </div>
                </StaggerItem>
              );
            })}
          </StaggerGrid>
        )}
      </div>
    </div>
  );
}
