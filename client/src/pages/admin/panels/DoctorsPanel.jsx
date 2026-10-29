import { useEffect, useState } from 'react';
import api, { apiErrorMessage } from '../../../api/client';
import { useToast } from '../../../components/Toast';
import { useConfirm } from '../../../components/ConfirmDialog';

const emptyForm = {
  mobile: '',
  name: '',
  specialityId: '',
  fee: '',
  clinicFee: '',
  languages: '',
  experienceYrs: '',
  registrationNo: '',
  bio: '',
};

export default function DoctorsPanel() {
  const [doctors, setDoctors] = useState([]);
  const [specialities, setSpecialities] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [newSpeciality, setNewSpeciality] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [togglingId, setTogglingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = () => {
    api.get('/admin/doctors').then((res) => setDoctors(res.data.doctors));
    api.get('/admin/specialities').then((res) => setSpecialities(res.data.specialities));
  };

  useEffect(() => {
    load();
  }, []);

  const addSpeciality = async () => {
    if (!newSpeciality.trim()) return;
    try {
      await api.post('/admin/specialities', { name: newSpeciality.trim() });
      setNewSpeciality('');
      toast?.success('Speciality added successfully');
      load();
    } catch (err) {
      toast?.error(apiErrorMessage(err));
    }
  };

  const toggleStatus = async (doctor) => {
    setTogglingId(doctor.id);
    try {
      const nextActive = !doctor.active;
      await api.put(`/admin/doctors/${doctor.id}`, { active: nextActive });
      toast?.success(`Doctor ${doctor.name} is now ${nextActive ? 'Active' : 'Inactive'}`);
      load();
    } catch (err) {
      toast?.error(apiErrorMessage(err));
    } finally {
      setTogglingId(null);
    }
  };

  const deleteDoctor = async (doctor) => {
    const ok = await confirm({
      title: `Delete Dr. ${doctor.name}?`,
      message: `Are you sure you want to permanently delete Dr. ${doctor.name} (${doctor.account?.mobile || 'No mobile'})? This will remove the doctor profile and all associated slots.`,
      confirmLabel: 'Delete Doctor',
      danger: true,
    });
    if (!ok) return;

    setDeletingId(doctor.id);
    try {
      const res = await api.delete(`/admin/doctors/${doctor.id}`);
      toast?.success(res.data.message || `Dr. ${doctor.name} deleted successfully.`);
      load();
    } catch (err) {
      if (err.response?.data?.error?.code === 'DOCTOR_HAS_APPOINTMENTS') {
        const forceOk = await confirm({
          title: 'Doctor has active appointments',
          message: `${err.response.data.error.message}\n\nDo you want to FORCE delete this doctor and remove all linked appointment records?`,
          confirmLabel: 'Force Delete',
          danger: true,
        });
        if (forceOk) {
          try {
            const forceRes = await api.delete(`/admin/doctors/${doctor.id}?force=true`);
            toast?.success(forceRes.data.message || 'Doctor and related data force deleted.');
            load();
          } catch (forceErr) {
            toast?.error(apiErrorMessage(forceErr));
          }
        }
      } else {
        toast?.error(apiErrorMessage(err));
        if (err.response?.status === 404) {
          load();
        }
      }
    } finally {
      setDeletingId(null);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/admin/doctors', {
        ...form,
        mobile: form.mobile.trim(),
        fee: Number(form.fee),
        clinicFee: form.clinicFee ? Number(form.clinicFee) : 0,
        experienceYrs: Number(form.experienceYrs || 0),
        languages: form.languages ? form.languages.split(',').map((s) => s.trim()).filter(Boolean) : [],
      });
      setForm(emptyForm);
      toast?.success(`Doctor registered successfully! They can now log in using ${form.mobile}`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const filteredDoctors = doctors.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.speciality?.name && d.speciality.name.toLowerCase().includes(search.toLowerCase())) ||
    (d.account?.mobile && d.account.mobile.includes(search))
  );

  return (
    <div className="grid lg:grid-cols-2 gap-6 items-start">
      {/* Left Column: Onboard Doctor Form */}
      <div className="card space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Onboard a Doctor</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Only administrators can register doctors. The doctor will log in using this registered mobile number.
          </p>
        </div>

        {/* Quick Add Speciality */}
        <div className="flex gap-2">
          <input
            className="input text-sm"
            placeholder="New speciality name"
            value={newSpeciality}
            onChange={(e) => setNewSpeciality(e.target.value)}
          />
          <button
            className="btn-secondary shrink-0 text-sm"
            onClick={addSpeciality}
            type="button"
          >
            Add speciality
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Doctor Full Name *</label>
            <input
              className="input"
              placeholder="e.g. Dr. Priya Sharma"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              WhatsApp / Login Mobile (+91...) *
            </label>
            <input
              className="input"
              placeholder="+91 98765 43210"
              required
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/[^\d+]/g, '') })}
            />
            <span className="text-[11px] text-slate-500 block mt-0.5">
              OTP verification code will be sent to this number for doctor dashboard login.
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Speciality *</label>
            <select
              className="input"
              required
              value={form.specialityId}
              onChange={(e) => setForm({ ...form, specialityId: e.target.value })}
            >
              <option value="">Select speciality *</option>
              {specialities.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Video Fee (₹) *</label>
              <input
                className="input"
                type="number"
                placeholder="600"
                required
                value={form.fee}
                onChange={(e) => setForm({ ...form, fee: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Clinic Fee (₹)</label>
              <input
                className="input"
                type="number"
                placeholder="800"
                value={form.clinicFee}
                onChange={(e) => setForm({ ...form, clinicFee: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Experience (yrs)</label>
              <input
                className="input"
                type="number"
                placeholder="8"
                value={form.experienceYrs}
                onChange={(e) => setForm({ ...form, experienceYrs: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Reg. Number</label>
              <input
                className="input"
                placeholder="MCI-12345"
                value={form.registrationNo}
                onChange={(e) => setForm({ ...form, registrationNo: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Languages (comma separated)</label>
            <input
              className="input"
              placeholder="English, Hindi, Bengali"
              value={form.languages}
              onChange={(e) => setForm({ ...form, languages: e.target.value })}
            />
          </div>

          <button
            type="submit"
            className="btn-primary w-full py-3 text-[15px] font-bold shadow-xs hover:shadow-md transition-all"
            disabled={busy}
          >
            {busy ? 'Registering Doctor…' : 'Register & Onboard Doctor'}
          </button>
        </form>
      </div>

      {/* Right Column: Doctor List & Management */}
      <div className="card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Registered Doctors ({doctors.length})
            </h2>
            <p className="text-xs text-slate-500">Manage doctor profiles and login access status</p>
          </div>
          <input
            type="text"
            className="input text-xs py-1.5 w-48"
            placeholder="Search doctors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="space-y-3 max-h-[38rem] overflow-y-auto pr-1">
          {filteredDoctors.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              No doctors found.
            </div>
          ) : (
            filteredDoctors.map((d) => (
              <div
                key={d.id}
                className="p-4 rounded-2xl bg-[#FDFBF9] border border-[#EBE3D8] hover:border-[#CAA067]/40 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-[#2B434C] text-[15px]">
                      {d.name}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        d.active
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {d.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#CAA067]">
                      {d.speciality?.name || 'General'}
                    </span>
                    <span>&middot;</span>
                    <span>{d.experienceYrs || 0} yrs exp</span>
                    <span>&middot;</span>
                    <span className="font-bold text-slate-800">
                      ₹{Number(d.fee).toFixed(0)}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 flex items-center gap-1.5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                    <span className="font-mono text-slate-700">
                      {d.account?.mobile || 'No mobile linked'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => toggleStatus(d)}
                    disabled={togglingId === d.id || deletingId === d.id}
                    className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-colors ${
                      d.active
                        ? 'bg-white border-rose-200 text-rose-700 hover:bg-rose-50'
                        : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {togglingId === d.id
                      ? 'Updating…'
                      : d.active
                      ? 'Deactivate'
                      : 'Activate'}
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteDoctor(d)}
                    disabled={deletingId === d.id || togglingId === d.id}
                    title={`Delete Dr. ${d.name}`}
                    className="text-xs font-bold px-2.5 py-1.5 rounded-xl border border-red-200 text-red-600 bg-red-50/50 hover:bg-red-100/80 transition-colors flex items-center gap-1"
                  >
                    {deletingId === d.id ? (
                      'Deleting…'
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
                        </svg>
                        Delete
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
