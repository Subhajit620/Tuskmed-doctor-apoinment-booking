import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';

const PAGE_SIZES = [5, 10, 25];

export default function DoctorPastAppointments() {
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [mode, setMode] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ appointments: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get('/doctor/appointments/past', { params: { search: search || undefined, from: from || undefined, to: to || undefined, mode: mode || undefined, page, pageSize } })
      .then((res) => setData(res.data))
      .finally(() => setLoading(false));
  }, [search, from, to, mode, page, pageSize]);

  const clearFilters = () => {
    setSearch('');
    setFrom('');
    setTo('');
    setMode('');
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">Your Past Appointments</h1>
        {!loading && <span className="badge bg-slate-100 text-slate-500">{data.total} total</span>}
      </div>

      <div className="card flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="label">Search patient</label>
          <input className="input" placeholder="Patient name" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input" value={mode} onChange={(e) => { setMode(e.target.value); setPage(1); }}>
            <option value="">All</option>
            <option value="VIDEO">Video</option>
            <option value="IN_CLINIC">Clinic</option>
          </select>
        </div>
        <button className="btn-secondary" onClick={clearFilters}>Clear Filters</button>
      </div>

      <div className="card !p-0 overflow-x-auto">
        {loading ? (
          <p className="p-6 text-sm text-slate-400">Loading...</p>
        ) : data.appointments.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">No past appointments match these filters.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-4 py-2 font-medium">Patient</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Prescription</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.appointments.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(a.slot.start).toLocaleDateString()}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(a.slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-4 py-3">
                    <Link to={`/doctor/patients/${a.patient.id}`} className="text-amber-600 font-medium hover:underline">
                      {a.patient.name} <span className="text-slate-400 font-normal">({a.patient.age})</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">{a.mode === 'VIDEO' ? 'Video' : 'Clinic'}</td>
                  <td className="px-4 py-3"><span className="badge bg-slate-100 text-slate-600">{a.status}</span></td>
                  <td className="px-4 py-3">
                    {a.prescriptionSent ? (
                      <span className="badge bg-emerald-100 text-emerald-700">&#10003; Prescription Sent</span>
                    ) : (
                      <span className="badge bg-amber-100 text-amber-700">&#9888; Prescription Not Sent</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Rows per page</span>
          {PAGE_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => { setPageSize(size); setPage(1); }}
              className={`px-2.5 py-1 rounded-md border ${pageSize === size ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {size}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary !px-3 !py-1.5" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="text-slate-500">Page {data.page || page} of {data.totalPages}</span>
          <button className="btn-secondary !px-3 !py-1.5" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
