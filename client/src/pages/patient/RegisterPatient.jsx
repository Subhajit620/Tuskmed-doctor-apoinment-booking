import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Reveal } from '../../components/motion';

const GENDERS = ['MALE', 'FEMALE', 'OTHER'];
const RELATIONSHIPS = ['Self', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Grandparent', 'Other'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];

const initialForm = {
  name: '',
  relationship: 'Spouse',
  mobile: '',
  email: '',
  dob: '',
  gender: 'FEMALE',
  state: '',
  city: '',
  bloodGroup: 'O+',
  emergencyPhone: '',
  makeActive: true,
};

export default function RegisterPatient() {
  const { setPatients, switchActivePatient } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [successPatient, setSuccessPatient] = useState(null);
  const navigate = useNavigate();

  const todayStr = new Date().toISOString().slice(0, 10);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);

    try {
      const payload = {
        name: form.name.trim(),
        mobile: form.mobile.trim() || undefined,
        email: form.email.trim() || undefined,
        dob: form.dob,
        gender: form.gender,
        state: form.state.trim() || undefined,
        city: form.city.trim() || undefined,
      };

      const res = await api.post('/patients', payload);
      const newPatient = res.data.patient;

      // Update state
      setPatients((prev) => [...prev, newPatient]);

      // Save extra details in localStorage
      localStorage.setItem(
        `tuskmed_patient_extra_${newPatient.id}`,
        JSON.stringify({
          relationship: form.relationship,
          bloodGroup: form.bloodGroup,
          emergencyPhone: form.emergencyPhone,
        })
      );

      if (form.makeActive) {
        await switchActivePatient(newPatient.id);
      }

      setSuccessPatient(newPatient);
      setForm(initialForm);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Reveal>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Register a New Patient</h1>
            <p className="text-slate-500 text-sm">
              Add a family member or dependent to your account to book appointments and manage records for them.
            </p>
          </div>
          <Link to="/patient/change-patient" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            View All Patients &rarr;
          </Link>
        </div>
      </Reveal>

      {successPatient && (
        <div className="card bg-green-50 border-green-200 p-5 space-y-3">
          <div className="flex items-center gap-3 text-green-800 font-semibold text-lg">
            <span className="h-8 w-8 rounded-full bg-green-200 text-green-800 flex items-center justify-center text-sm font-bold">✓</span>
            Patient profile created successfully!
          </div>
          <p className="text-sm text-green-700">
            <strong>{successPatient.name}</strong> has been registered to your account.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              onClick={() => navigate('/patient')}
              className="btn-primary text-sm py-2 px-4"
            >
              Go to Dashboard
            </button>
            <button
              onClick={() => navigate('/patient/doctors')}
              className="btn-secondary text-sm py-2 px-4"
            >
              Book a Consultation
            </button>
            <button
              onClick={() => setSuccessPatient(null)}
              className="text-sm text-slate-600 hover:text-slate-900 underline px-2 py-2"
            >
              Register Another Patient
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-center gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={submit} className="card space-y-6">
        {/* Relationship & Personal Info */}
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-brand-600">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Patient & Family Details
          </h2>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Full Name *</label>
              <input
                type="text"
                required
                className="input"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="e.g. Sarah Doe"
              />
            </div>


            <div>
              <label className="label">Date of Birth *</label>
              <input
                type="date"
                required
                max={todayStr}
                className="input"
                value={form.dob}
                onChange={(e) => handleChange('dob', e.target.value)}
              />
            </div>

            <div>
              <label className="label">Gender *</label>
              <select
                className="input"
                value={form.gender}
                onChange={(e) => handleChange('gender', e.target.value)}
              >
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g.charAt(0) + g.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>


            <div>
              <label className="label">Phone / Mobile (Optional)</label>
              <input
                type="tel"
                className="input"
                value={form.mobile}
                onChange={(e) => handleChange('mobile', e.target.value)}
                placeholder="Direct mobile if different"
              />
            </div>
          </div>
        </div>

     


        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/patient/change-patient')}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !form.name.trim() || !form.dob}
            className="btn-primary min-w-[170px]"
          >
            {busy ? 'Registering...' : 'Register Patient'}
          </button>
        </div>
      </form>
    </div>
  );
}
