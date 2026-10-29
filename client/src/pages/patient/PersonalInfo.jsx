import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api, { apiErrorMessage } from '../../api/client';
import { Reveal } from '../../components/motion';

const GENDERS = ['MALE', 'FEMALE', 'OTHER'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];

export default function PersonalInfo() {
  const { activePatient, account, setPatients, switchActivePatient, refresh } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    mobile: account?.mobile || '',
    email: '',
    dob: '',
    gender: 'FEMALE',
    state: '',
    city: '',
    bloodGroup: 'O+',
    emergencyName: '',
    emergencyPhone: '',
    allergies: '',
    medicalHistory: '',
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Load patient data from activePatient and localStorage extension
  useEffect(() => {
    if (!activePatient) {
      if (account?.mobile) {
        setFormData((prev) => ({ ...prev, mobile: prev.mobile || account.mobile }));
      }
      return;
    }

    const savedExtra = localStorage.getItem(`tuskmed_patient_extra_${activePatient.id}`);
    let extra = {};
    if (savedExtra) {
      try {
        extra = JSON.parse(savedExtra);
      } catch (e) {
        // ignore
      }
    }

    setFormData({
      name: activePatient.name || '',
      mobile: activePatient.mobile || account?.mobile || '',
      email: activePatient.email || '',
      dob: activePatient.dob ? new Date(activePatient.dob).toISOString().slice(0, 10) : '',
      gender: activePatient.gender || 'FEMALE',
      state: activePatient.state || '',
      city: activePatient.city || '',
      bloodGroup: extra.bloodGroup || 'O+',
      emergencyName: extra.emergencyName || '',
      emergencyPhone: extra.emergencyPhone || '',
      allergies: extra.allergies || '',
      medicalHistory: extra.medicalHistory || '',
    });
  }, [activePatient, account]);

  const handleChange = (field, val) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
    if (message.text) setMessage({ type: '', text: '' });
  };

  const calculateCompletion = () => {
    const fields = ['name', 'dob', 'gender', 'mobile', 'email', 'city', 'state', 'bloodGroup', 'emergencyPhone'];
    const filled = fields.filter((f) => !!formData[f]?.trim?.() || !!formData[f]);
    return Math.round((filled.length / fields.length) * 100);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      let savedPatient = null;

      if (activePatient) {
        // 1. Update basic backend patient fields
        const res = await api.put(`/patients/${activePatient.id}`, {
          name: formData.name,
          mobile: formData.mobile,
          email: formData.email,
          dob: formData.dob,
          gender: formData.gender,
          state: formData.state,
          city: formData.city,
        });
        savedPatient = res.data.patient;

        // Update in memory patients state
        setPatients((prev) =>
          prev.map((p) => (p.id === activePatient.id ? { ...p, ...savedPatient } : p))
        );
      } else {
        // Create primary patient profile for this account
        const res = await api.post('/patients', {
          name: formData.name,
          mobile: formData.mobile || undefined,
          email: formData.email || undefined,
          dob: formData.dob,
          gender: formData.gender,
          state: formData.state || undefined,
          city: formData.city || undefined,
        });
        savedPatient = res.data.patient;
        setPatients((prev) => [...prev, savedPatient]);
        await switchActivePatient(savedPatient.id);
      }

      // 2. Persist extended medical and emergency information in localStorage per patient
      if (savedPatient?.id) {
        localStorage.setItem(
          `tuskmed_patient_extra_${savedPatient.id}`,
          JSON.stringify({
            bloodGroup: formData.bloodGroup,
            emergencyName: formData.emergencyName,
            emergencyPhone: formData.emergencyPhone,
            allergies: formData.allergies,
            medicalHistory: formData.medicalHistory,
          })
        );
      }

      setMessage({
        type: 'success',
        text: activePatient
          ? 'Personal information updated successfully!'
          : 'Primary patient profile created and activated successfully!',
      });
      await refresh();
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const completionPct = calculateCompletion();
  const initials = activePatient?.name
    ? activePatient.name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
    : formData.name
    ? formData.name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
    : 'PT';

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Reveal>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Personal Information</h1>
            <p className="text-slate-500 text-sm">
              Manage personal details, contact info, and medical records for{' '}
              <strong className="text-slate-700">{activePatient?.name || formData.name || 'Your Profile'}</strong>.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 font-medium">Profile Completeness:</span>
            <div className="w-28 bg-slate-200 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ${
                  completionPct >= 80 ? 'bg-green-500' : completionPct >= 50 ? 'bg-amber-500' : 'bg-brand-500'
                }`}
                style={{ width: `${completionPct}%` }}
              />
            </div>
            <span className="text-xs font-bold text-slate-700">{completionPct}%</span>
          </div>
        </div>
      </Reveal>

      {message.text && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{message.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{message.text}</span>
        </div>
      )}

      {/* Header Profile Badge */}
      <div className="card bg-gradient-to-r from-brand-50/70 via-white to-brand-50/40 border-brand-100 flex flex-col sm:flex-row items-center gap-5">
        <div className="h-16 w-16 rounded-2xl bg-brand-600 text-white flex items-center justify-center font-display font-bold text-xl shadow-md">
          {initials}
        </div>
        <div className="space-y-1 text-center sm:text-left flex-1">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <h2 className="text-xl font-bold text-slate-900">{activePatient?.name || formData.name || 'Create Primary Profile'}</h2>
            <span className="badge bg-brand-100 text-brand-700 font-medium text-xs">
              {activePatient ? 'Active Profile' : 'New Profile'}
            </span>
            {activePatient && (
              <span className="badge bg-slate-100 text-slate-600 text-xs">ID: {activePatient.id.slice(0, 8)}</span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            {activePatient?.age !== undefined ? `${activePatient.age} yrs` : '—'} &middot;{' '}
            {formData.gender ? formData.gender.charAt(0) + formData.gender.slice(1).toLowerCase() : '—'} &middot;{' '}
            {formData.bloodGroup || 'Blood Group N/A'} &middot;{' '}
            {formData.city ? `${formData.city}, ${formData.state || ''}` : 'Location not set'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Basic Information */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-brand-600">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <h3 className="font-semibold text-slate-900">Basic & Demographic Details</h3>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Full Name *</label>
              <input
                type="text"
                required
                className="input"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="e.g. John Doe"
              />
            </div>

            <div>
              <label className="label">Date of Birth *</label>
              <input
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
                className="input"
                value={formData.dob}
                onChange={(e) => handleChange('dob', e.target.value)}
              />
            </div>

            <div>
              <label className="label">Gender *</label>
              <select
                className="input"
                value={formData.gender}
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
              <label className="label">Blood Group</label>
              <select
                className="input"
                value={formData.bloodGroup}
                onChange={(e) => handleChange('bloodGroup', e.target.value)}
              >
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Contact & Address */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-brand-600">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            <h3 className="font-semibold text-slate-900">Contact & Address Details</h3>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Phone / Mobile Number</label>
              <input
                type="tel"
                className="input"
                value={formData.mobile}
                onChange={(e) => handleChange('mobile', e.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>

            <div>
              <label className="label">Email Address</label>
              <input
                type="email"
                className="input"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="patient@example.com"
              />
            </div>

            <div>
              <label className="label">City</label>
              <input
                type="text"
                className="input"
                value={formData.city}
                onChange={(e) => handleChange('city', e.target.value)}
                placeholder="e.g. Mumbai"
              />
            </div>

            <div>
              <label className="label">State / Province</label>
              <input
                type="text"
                className="input"
                value={formData.state}
                onChange={(e) => handleChange('state', e.target.value)}
                placeholder="e.g. Maharashtra"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Emergency & Clinical Info */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-brand-600">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <h3 className="font-semibold text-slate-900">Emergency & Clinical Background</h3>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Emergency Contact Name</label>
              <input
                type="text"
                className="input"
                value={formData.emergencyName}
                onChange={(e) => handleChange('emergencyName', e.target.value)}
                placeholder="Spouse / Parent / Sibling Name"
              />
            </div>

            <div>
              <label className="label">Emergency Contact Phone</label>
              <input
                type="tel"
                className="input"
                value={formData.emergencyPhone}
                onChange={(e) => handleChange('emergencyPhone', e.target.value)}
                placeholder="Emergency phone number"
              />
            </div>
          </div>

          <div>
            <label className="label">Known Drug / Food Allergies</label>
            <input
              type="text"
              className="input"
              value={formData.allergies}
              onChange={(e) => handleChange('allergies', e.target.value)}
              placeholder="e.g. Penicillin, Peanuts, Dust (or None)"
            />
          </div>

          <div>
            <label className="label">Pre-existing Conditions / Medical History</label>
            <textarea
              rows={3}
              className="input"
              value={formData.medicalHistory}
              onChange={(e) => handleChange('medicalHistory', e.target.value)}
              placeholder="e.g. Hypertension (5 yrs), Type-2 Diabetes, Asthma, Previous surgeries..."
            />
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-end gap-3">
          <button
            type="submit"
            disabled={saving || !formData.name || !formData.dob}
            className="btn-primary min-w-[160px] flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving Changes...
              </>
            ) : (
              'Save Personal Info'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
