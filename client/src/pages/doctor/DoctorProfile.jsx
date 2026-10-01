import { useEffect, useState } from 'react';
import api, { apiErrorMessage } from '../../api/client';
import { useToast } from '../../components/Toast';
import { Reveal } from '../../components/motion';

const SEX_OPTIONS = ['MALE', 'FEMALE', 'OTHER'];

function LockedField({ label, value }) {
  return (
    <div>
      <label className="label">{label} <span className="text-slate-400 font-normal">(cannot be changed)</span></label>
      <input className="input bg-slate-50 text-slate-500" value={value || ''} disabled readOnly />
    </div>
  );
}

export default function DoctorProfile() {
  const [form, setForm] = useState(null);
  const [specialities, setSpecialities] = useState([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    Promise.all([api.get('/doctor/me'), api.get('/specialities')]).then(([meRes, specRes]) => {
      setForm({ ...meRes.data.doctor, dob: meRes.data.doctor.dob ? meRes.data.doctor.dob.slice(0, 10) : '' });
      setSpecialities(specRes.data.specialities);
    });
  }, []);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        title: form.title,
        firstName: form.firstName,
        middleName: form.middleName,
        lastName: form.lastName,
        email: form.email,
        sex: form.sex,
        dob: form.dob || undefined,
        address: form.address,
        clinicLocation: form.clinicLocation,
        specialityId: form.specialityId,
        registrationNo: form.registrationNo,
        experienceYrs: form.experienceYrs,
        fee: form.fee,
        clinicFee: form.clinicFee,
        languages: typeof form.languages === 'string' ? form.languages.split(',').map((s) => s.trim()).filter(Boolean) : form.languages,
        photoUrl: form.photoUrl,
        bio: form.bio,
      };
      const res = await api.put('/doctor/me', payload);
      setForm({ ...res.data.doctor, dob: res.data.doctor.dob ? res.data.doctor.dob.slice(0, 10) : '' });
      toast.success('Profile updated.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!form) return <p className="text-sm text-slate-400">Loading...</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">View Profile</h1>
      <p className="text-sm text-slate-500">This is also what patients see when they view your public profile.</p>

      <Reveal className="card space-y-4">
        <h2 className="font-semibold">Personal details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="label">Title</label>
            <input className="input" value={form.title || ''} onChange={set('title')} placeholder="Dr." />
          </div>
          <div>
            <label className="label">First Name</label>
            <input className="input" value={form.firstName || ''} onChange={set('firstName')} />
          </div>
          <div>
            <label className="label">Middle Name</label>
            <input className="input" value={form.middleName || ''} onChange={set('middleName')} />
          </div>
          <div>
            <label className="label">Last Name</label>
            <input className="input" value={form.lastName || ''} onChange={set('lastName')} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email || ''} onChange={set('email')} />
          </div>
          <div>
            <label className="label">Sex</label>
            <select className="input" value={form.sex || ''} onChange={set('sex')}>
              <option value="">Select</option>
              {SEX_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Date of Birth</label>
            <input type="date" className="input" value={form.dob || ''} onChange={set('dob')} />
          </div>
        </div>
        <div>
          <label className="label">Address</label>
          <input className="input" value={form.address || ''} onChange={set('address')} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <LockedField label="Mobile Number" value={form.mobile} />
          <LockedField label="City" value={form.city} />
          <LockedField label="State" value={form.state} />
        </div>
      </Reveal>

      <Reveal delay={0.08} className="card space-y-4">
        <h2 className="font-semibold">Practice details</h2>
        <div>
          <label className="label">Full Clinic Location</label>
          <input className="input" value={form.clinicLocation || ''} onChange={set('clinicLocation')} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Specialty</label>
            <select className="input" value={form.specialityId || ''} onChange={set('specialityId')}>
              {specialities.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Registration Number</label>
            <input className="input" value={form.registrationNo || ''} onChange={set('registrationNo')} />
          </div>
          <div>
            <label className="label">Experience (years)</label>
            <input type="number" min="0" className="input" value={form.experienceYrs ?? ''} onChange={set('experienceYrs')} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Video consultation fee (&#8377;)</label>
            <input type="number" min="0" className="input" value={form.fee ?? ''} onChange={set('fee')} />
          </div>
          <div>
            <label className="label">In-clinic consultation fee (&#8377;)</label>
            <input type="number" min="0" className="input" value={form.clinicFee ?? ''} onChange={set('clinicFee')} />
          </div>
        </div>
        <div>
          <label className="label">Languages (comma separated)</label>
          <input
            className="input"
            value={Array.isArray(form.languages) ? form.languages.join(', ') : form.languages || ''}
            onChange={set('languages')}
          />
        </div>
        <div>
          <label className="label">Photo URL</label>
          <input className="input" value={form.photoUrl || ''} onChange={set('photoUrl')} placeholder="https://..." />
        </div>
        <div>
          <label className="label">Bio</label>
          <textarea className="input" rows={4} value={form.bio || ''} onChange={set('bio')} />
        </div>
      </Reveal>

      <Reveal delay={0.14}>
        <button className="btn-primary transition-transform hover:scale-[1.02] active:scale-[0.98]" disabled={busy} onClick={save}>
          {busy ? 'Saving...' : 'Save changes'}
        </button>
      </Reveal>
    </div>
  );
}
