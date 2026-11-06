import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../../../api/client';
import { useToast } from '../../../components/Toast';
import { useConfirm } from '../../../components/ConfirmDialog';

function getNextDays(count = 14) {
  const days = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const label =
      i === 0
        ? `Today (${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})`
        : i === 1
        ? `Tomorrow (${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})`
        : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    days.push({ dateStr, label });
  }
  return days;
}

const emptyPatientForm = {
  name: '',
  mobile: '',
  age: '',
  gender: 'MALE',
  city: '',
  state: '',
  email: '',
};

export default function PatientsAndBookingPanel() {
  const toast = useToast();
  const confirm = useConfirm();
  const nextDays = useMemo(() => getNextDays(14), []);

  // Data lists
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [specialities, setSpecialities] = useState([]);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Patient Mode: 'new' | 'existing'
  const [patientMode, setPatientMode] = useState('new');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [patientForm, setPatientForm] = useState(emptyPatientForm);
  const [patientSearch, setPatientSearch] = useState('');

  // CRUD Edit / Delete state
  const [editingPatient, setEditingPatient] = useState(null);
  const [editForm, setEditForm] = useState(emptyPatientForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Booking selections
  const [specialityId, setSpecialityId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [mode, setMode] = useState('VIDEO');
  const [timingMode, setTimingMode] = useState('instant'); // 'instant' | 'slot'
  const [date, setDate] = useState(nextDays[0]?.dateStr || '');
  const [slotId, setSlotId] = useState('');
  const [symptoms, setSymptoms] = useState('');

  // Status
  const [busy, setBusy] = useState(false);
  const [savingPatientOnly, setSavingPatientOnly] = useState(false);
  const [error, setError] = useState('');
  const [bookedResult, setBookedResult] = useState(null);
  const [registeredPatientResult, setRegisteredPatientResult] = useState(null);

  const loadData = () => {
    api.get('/admin/patients').then((res) => setPatients(res.data.patients || [])).catch(() => {});
    api.get('/admin/doctors').then((res) => {
      const activeDocs = (res.data.doctors || []).filter((d) => d.active !== false);
      setDoctors(activeDocs);
      if (activeDocs.length > 0 && !doctorId) {
        setDoctorId(activeDocs[0].id);
      }
    }).catch(() => {});
    api.get('/admin/specialities').then((res) => setSpecialities(res.data.specialities || [])).catch(() => {});
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredDoctors = useMemo(() => {
    if (!specialityId) return doctors;
    return doctors.filter((d) => d.specialityId === specialityId);
  }, [doctors, specialityId]);

  useEffect(() => {
    if (filteredDoctors.length > 0 && !filteredDoctors.some((d) => d.id === doctorId)) {
      setDoctorId(filteredDoctors[0].id);
    }
  }, [filteredDoctors, doctorId]);

  useEffect(() => {
    if (timingMode !== 'slot' || !doctorId || !date || !mode) {
      setSlots([]);
      setSlotId('');
      return;
    }
    setLoadingSlots(true);
    setSlotId('');
    api
      .get(`/doctors/${doctorId}/slots`, { params: { date, mode } })
      .then((res) => {
        const list = res.data.slots || [];
        setSlots(list);
        if (list.length > 0) setSlotId(list[0].id);
      })
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [timingMode, doctorId, date, mode]);

  // CREATE: Register Patient & Create Account
  const handleRegisterPatientOnly = async () => {
    setError('');
    setRegisteredPatientResult(null);
    if (!patientForm.name.trim() || !patientForm.mobile.trim()) {
      setError('Patient Name and 10-digit Phone Number are required.');
      return;
    }
    if (!patientForm.age || Number.isNaN(Number(patientForm.age))) {
      setError('Please enter the patient’s Age.');
      return;
    }
    if (!patientForm.city.trim()) {
      setError('Please enter the patient’s City / Town.');
      return;
    }
    setSavingPatientOnly(true);
    try {
      const res = await api.post('/admin/patients', patientForm);
      const created = res.data.patient;
      setRegisteredPatientResult(created);
      toast?.success(`Patient account created for ${created.name} (${created.mobile})!`);
      setPatientForm(emptyPatientForm);
      await loadData();
      setPatientMode('existing');
      setSelectedPatientId(created.id);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSavingPatientOnly(false);
    }
  };

  // UPDATE: Open Edit Modal & Save Patient Changes
  const openEditPatient = (p) => {
    setEditingPatient(p);
    setEditForm({
      name: p.name || '',
      mobile: (p.mobile || '').replace(/^\+91/, ''),
      age: p.age !== undefined && p.age !== null ? String(p.age) : '',
      gender: p.gender || 'MALE',
      city: p.city || '',
      state: p.state || '',
      email: p.email || '',
    });
  };

  const handleSaveEditPatient = async (e) => {
    e.preventDefault();
    if (!editingPatient) return;
    if (!editForm.name.trim() || !editForm.mobile.trim()) {
      toast?.error('Patient Name and Phone Number are required.');
      return;
    }
    setSavingEdit(true);
    try {
      const res = await api.put(`/admin/patients/${editingPatient.id}`, editForm);
      toast?.success(`Updated patient ${res.data.patient.name} successfully!`);
      setEditingPatient(null);
      loadData();
    } catch (err) {
      toast?.error(apiErrorMessage(err));
    } finally {
      setSavingEdit(false);
    }
  };

  // DELETE: Delete Patient & Clean Up Records
  const handleDeletePatient = async (p) => {
    const ok = await confirm({
      title: `Delete patient ${p.name}?`,
      message: `This will permanently delete ${p.name} (${p.mobile || 'No phone'}) along with their appointment history and account if no other profiles exist.\n\nThis action cannot be undone.`,
      confirmLabel: 'Delete Patient',
      danger: true,
    });
    if (!ok) return;

    setDeletingId(p.id);
    try {
      await api.delete(`/admin/patients/${p.id}`);
      toast?.success(`Patient ${p.name} deleted.`);
      if (selectedPatientId === p.id) {
        setSelectedPatientId('');
      }
      loadData();
    } catch (err) {
      toast?.error(apiErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  const handleBookAndConsult = async (e) => {
    e.preventDefault();
    setError('');
    setBookedResult(null);

    if (patientMode === 'existing' && !selectedPatientId) {
      setError('Please select a patient from the list.');
      return;
    }
    if (patientMode === 'new' && (!patientForm.name.trim() || !patientForm.mobile.trim())) {
      setError('Please enter the new patient’s name and 10-digit mobile number.');
      return;
    }
    if (!doctorId) {
      setError('Please select a doctor.');
      return;
    }
    if (timingMode === 'slot' && !slotId) {
      setError('Please select an available time slot or switch to Instant Consultation Now.');
      return;
    }

    setBusy(true);
    try {
      const payload = {
        patientId: patientMode === 'existing' ? selectedPatientId : undefined,
        newPatient: patientMode === 'new' ? patientForm : undefined,
        doctorId,
        mode,
        instantNow: timingMode === 'instant',
        slotId: timingMode === 'slot' ? slotId : undefined,
        symptoms: symptoms.trim() || 'Consultation booked by Admin',
      };

      const res = await api.post('/admin/appointments/book', payload);
      setBookedResult(res.data);
      toast?.success('Appointment booked! WhatsApp & Message Box links sent to Patient and Doctor.');
      if (patientMode === 'new') {
        setPatientForm(emptyPatientForm);
      }
      setSymptoms('');
      loadData();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const copyLink = (url, label) => {
    if (!url) return;
    navigator.clipboard?.writeText(url);
    toast?.success(`${label} copied to clipboard!`);
  };

  const filteredPatients = patients.filter(
    (p) =>
      p.name?.toLowerCase().includes(patientSearch.toLowerCase()) ||
      p.mobile?.includes(patientSearch) ||
      p.city?.toLowerCase().includes(patientSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Registered Patient Account Created Banner */}
      {registeredPatientResult && (
        <div className="rounded-3xl bg-emerald-50 border border-emerald-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider">
              ✓ Patient Account Created &amp; Synced to Patient Dashboard
            </span>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
              {registeredPatientResult.name} &middot; {registeredPatientResult.age ?? '—'} Yrs ({registeredPatientResult.gender})
            </h3>
            <p className="text-xs text-slate-600">
              Login Phone: <strong className="font-mono text-slate-900">{registeredPatientResult.mobile}</strong> &middot; City/Town:{' '}
              <strong className="text-slate-900">{registeredPatientResult.city || '—'}</strong>
              {registeredPatientResult.state ? `, ${registeredPatientResult.state}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRegisteredPatientResult(null)}
            className="px-3 py-1.5 rounded-xl bg-white border border-emerald-300 text-emerald-800 text-xs font-bold hover:bg-emerald-100 self-start sm:self-center cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Booked Consultation Instant Launch Banner */}
      {bookedResult?.appointment && (
        <div className="rounded-3xl bg-gradient-to-r from-[#1B365D] via-[#152D4F] to-[#0E2038] text-white p-5 sm:p-6 shadow-xl border border-[#2D4D7A] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/15 pb-4">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold uppercase tracking-wider">
                ✓ Booking Confirmed &amp; Notified via WhatsApp
              </span>
              <h3 className="text-lg sm:text-xl font-black font-display">
                {bookedResult.appointment.patient?.name} <span className="text-slate-300 font-normal">with</span>{' '}
                {bookedResult.appointment.doctor?.name}
              </h3>
              <p className="text-xs text-slate-300">
                Scheduled: {new Date(bookedResult.appointment.slot?.start).toLocaleString()} &middot;{' '}
                {bookedResult.appointment.mode === 'VIDEO' ? 'Video Consultation' : 'In-Clinic Visit'}
              </p>
            </div>

            {bookedResult.appointment.mode === 'VIDEO' && (
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/consultation/${bookedResult.appointment.id}?role=DOCTOR`}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs sm:text-sm shadow-lg transition-all flex items-center gap-2"
                >
                  <span>🎥</span>
                  <span>Join / Consult Now (Doctor View)</span>
                </Link>
                <Link
                  to={`/consultation/${bookedResult.appointment.id}`}
                  className="px-3.5 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs transition-all"
                >
                  Open Patient View
                </Link>
              </div>
            )}
          </div>

          {bookedResult.patientJoinUrl && (
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase text-emerald-300">Patient Video Link</div>
                  <div className="truncate text-slate-200 font-mono text-[11px]">{bookedResult.patientJoinUrl}</div>
                </div>
                <button
                  type="button"
                  onClick={() => copyLink(bookedResult.patientJoinUrl, 'Patient link')}
                  className="px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white font-bold shrink-0 cursor-pointer"
                >
                  Copy
                </button>
              </div>

              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase text-[#E2C39B]">Doctor Video Link</div>
                  <div className="truncate text-slate-200 font-mono text-[11px]">{bookedResult.doctorJoinUrl}</div>
                </div>
                <button
                  type="button"
                  onClick={() => copyLink(bookedResult.doctorJoinUrl, 'Doctor link')}
                  className="px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white font-bold shrink-0 cursor-pointer"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Add Patient & Book Doctor Form */}
        <div className="lg:col-span-7 card space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Register Patient &amp; Book Consultation</h2>
              <p className="text-xs text-slate-500">
                Create a patient account (Name, Age, Phone, City/Town) or book a doctor consultation.
              </p>
            </div>

            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-bold self-start">
              <button
                type="button"
                onClick={() => setPatientMode('new')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  patientMode === 'new' ? 'bg-[#CAA067] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                + New Patient
              </button>
              <button
                type="button"
                onClick={() => setPatientMode('existing')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  patientMode === 'existing' ? 'bg-[#CAA067] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Existing ({patients.length})
              </button>
            </div>
          </div>

          {error && (
            <div className="text-xs sm:text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleBookAndConsult} className="space-y-5">
            {/* STEP 1: PATIENT DETAILS */}
            <div className="p-4 rounded-2xl bg-[#FAF3EC]/60 border border-[#E9D5C2] space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#2B434C]">
                  1. Register Patient Account (Name, Age, Phone &amp; City/Town)
                </span>
                <span className="text-[11px] font-semibold text-emerald-700">
                  Syncs to Patient Dashboard
                </span>
              </div>

              {patientMode === 'existing' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Select Registered Patient *</label>
                  <select
                    className="input"
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose a patient --</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.gender}, {p.age ?? '?'}y) — {p.mobile} {p.city ? `· ${p.city}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-3.5">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Patient Full Name *</label>
                      <input
                        className="input"
                        placeholder="e.g. Rahul Verma"
                        value={patientForm.name}
                        onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number (Login Mobile) *</label>
                      <input
                        className="input"
                        type="tel"
                        placeholder="10-digit mobile number"
                        value={patientForm.mobile}
                        onChange={(e) => setPatientForm({ ...patientForm, mobile: e.target.value.replace(/[^\d+]/g, '') })}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Age (Years) *</label>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        max="120"
                        placeholder="e.g. 30"
                        value={patientForm.age}
                        onChange={(e) => setPatientForm({ ...patientForm, age: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">City / Town *</label>
                      <input
                        className="input"
                        placeholder="e.g. Kolkata"
                        value={patientForm.city}
                        onChange={(e) => setPatientForm({ ...patientForm, city: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Gender *</label>
                      <select
                        className="input"
                        value={patientForm.gender}
                        onChange={(e) => setPatientForm({ ...patientForm, gender: e.target.value })}
                      >
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">State (Optional)</label>
                      <input
                        className="input"
                        placeholder="e.g. WB"
                        value={patientForm.state}
                        onChange={(e) => setPatientForm({ ...patientForm, state: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-t border-[#E9D5C2]/70">
                    <span className="text-[11px] text-slate-600">
                      Creates patient account &amp; syncs details to Patient Dashboard:
                    </span>
                    <button
                      type="button"
                      onClick={handleRegisterPatientOnly}
                      disabled={savingPatientOnly}
                      className="px-4 py-2 rounded-xl bg-[#2B434C] hover:bg-[#1E3138] text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      {savingPatientOnly ? 'Creating Account…' : '👤 Register Patient & Create Account'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* STEP 2: DOCTOR & CONSULTATION SELECTION */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3.5">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#2B434C] block">
                2. Assign Doctor &amp; Schedule
              </span>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Filter by Speciality</label>
                  <select
                    className="input"
                    value={specialityId}
                    onChange={(e) => setSpecialityId(e.target.value)}
                  >
                    <option value="">All Specialities</option>
                    {specialities.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Select Doctor *</label>
                  <select
                    className="input"
                    value={doctorId}
                    onChange={(e) => setDoctorId(e.target.value)}
                    required
                  >
                    <option value="">-- Select Doctor --</option>
                    {filteredDoctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.speciality?.name}) — ₹{mode === 'VIDEO' ? d.fee : d.clinicFee || d.fee}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Consultation Mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMode('VIDEO')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        mode === 'VIDEO'
                          ? 'bg-[#CAA067] text-white border-[#CAA067]'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      🎥 Video Call
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('IN_CLINIC')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        mode === 'IN_CLINIC'
                          ? 'bg-[#CAA067] text-white border-[#CAA067]'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      🏥 In-Clinic
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Consultation Time</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTimingMode('instant')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        timingMode === 'instant'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      ⚡ Instant Now
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimingMode('slot')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        timingMode === 'slot'
                          ? 'bg-[#CAA067] text-white border-[#CAA067]'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      📅 Pick Slot
                    </button>
                  </div>
                </div>
              </div>

              {timingMode === 'slot' && (
                <div className="grid sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Select Date</label>
                    <select className="input" value={date} onChange={(e) => setDate(e.target.value)}>
                      {nextDays.map((d) => (
                        <option key={d.dateStr} value={d.dateStr}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Available Time Slots</label>
                    {loadingSlots ? (
                      <div className="text-xs text-slate-500 py-2">Loading slots…</div>
                    ) : slots.length === 0 ? (
                      <div className="text-xs text-amber-700 py-2">
                        No open slots on this date. Use &ldquo;⚡ Instant Now&rdquo; or pick another date.
                      </div>
                    ) : (
                      <select className="input" value={slotId} onChange={(e) => setSlotId(e.target.value)}>
                        {slots.map((s) => (
                          <option key={s.id} value={s.id}>
                            {new Date(s.start).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true,
                            })}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Symptoms / Chief Complaint
                </label>
                <input
                  className="input"
                  placeholder="e.g. Fever & cough since 2 days, general teleconsultation"
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="btn-primary w-full py-3.5 text-sm sm:text-base font-extrabold shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              {busy
                ? 'Booking & Generating Consultation Room…'
                : timingMode === 'instant'
                ? '⚡ Confirm Booking & Start Instant Consultation'
                : '📅 Confirm Scheduled Appointment'}
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: Registered Patients Directory (Read, Update, Delete & Select) */}
        <div className="lg:col-span-5 card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Registered Patients ({patients.length})</h2>
              <p className="text-xs text-slate-500">View, edit, delete, or book a doctor for any patient</p>
            </div>
            <input
              type="text"
              className="input text-xs py-1.5 sm:w-44"
              placeholder="Search name, phone, city..."
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
            />
          </div>

          <div className="space-y-2.5 max-h-[38rem] overflow-y-auto pr-1">
            {filteredPatients.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">No patients found.</p>
            ) : (
              filteredPatients.map((p) => {
                const isSelected = patientMode === 'existing' && selectedPatientId === p.id;
                const isDeleting = deletingId === p.id;
                return (
                  <div
                    key={p.id}
                    className={`p-3.5 rounded-2xl border transition-all space-y-2.5 ${
                      isSelected
                        ? 'bg-[#FAF3EC] border-[#CAA067] shadow-2xs'
                        : 'bg-slate-50/70 border-slate-200/80 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm text-slate-900 truncate flex items-center gap-2">
                          <span>{p.name}</span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700">
                            {p.gender} &middot; {p.age ?? '?'}y
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                          <span className="font-mono font-semibold text-slate-700">{p.mobile}</span>
                          {(p.city || p.state) && (
                            <span>
                              &middot; {[p.city, p.state].filter(Boolean).join(', ')}
                            </span>
                          )}
                          <span>&middot; {p.appointmentsCount || 0} consults</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-200/60">
                      <button
                        type="button"
                        onClick={() => openEditPatient(p)}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 hover:border-[#CAA067] hover:text-[#2B434C] text-xs font-semibold transition-colors cursor-pointer"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleDeletePatient(p)}
                        className="px-2.5 py-1 rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40"
                      >
                        {isDeleting ? 'Deleting…' : '🗑️ Delete'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPatientMode('existing');
                          setSelectedPatientId(p.id);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-bold shrink-0 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#CAA067] text-white'
                            : 'bg-[#2B434C] text-white hover:bg-[#1E3138]'
                        }`}
                      >
                        {isSelected ? '✓ Selected' : 'Book Doctor'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* EDIT PATIENT MODAL (U in CRUD) */}
      {editingPatient && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Edit Patient Details</h3>
                <p className="text-xs text-slate-500">
                  Changes sync immediately to the patient’s account and Patient Dashboard.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingPatient(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditPatient} className="space-y-3.5">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                  <input
                    className="input"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number (Login Mobile) *</label>
                  <input
                    className="input"
                    type="tel"
                    value={editForm.mobile}
                    onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value.replace(/[^\d+]/g, '') })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Age (Years) *</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max="120"
                    value={editForm.age}
                    onChange={(e) => setEditForm({ ...editForm, age: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">City / Town *</label>
                  <input
                    className="input"
                    value={editForm.city}
                    onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Gender *</label>
                  <select
                    className="input"
                    value={editForm.gender}
                    onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">State</label>
                  <input
                    className="input"
                    value={editForm.state}
                    onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingPatient(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 rounded-xl bg-[#CAA067] hover:bg-[#B88F55] text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {savingEdit ? 'Saving…' : '✓ Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
