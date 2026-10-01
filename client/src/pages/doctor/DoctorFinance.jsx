import { useState } from 'react';
import api from '../../api/client';
import { AnimatedNumber, Reveal } from '../../components/motion';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function currentYear() {
  return new Date().getFullYear();
}
function currentMonth() {
  return new Date().getMonth() + 1;
}

/** Client-side CSV export - no backend change needed, works entirely off
 * the already-fetched consults list. */
function downloadConsultsCsv(consults, label) {
  const rows = [
    ['Date', 'Patient', 'Service', 'Fee (INR)'],
    ...consults.map((c) => [new Date(c.date).toLocaleDateString(), c.patient, c.service, c.fee]),
  ];
  const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `consults-${label}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function DoctorFinance() {
  const [tab, setTab] = useState('monthly');
  const [year, setYear] = useState(currentYear());
  const [month, setMonth] = useState(currentMonth());
  const [consults, setConsults] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  const years = Array.from({ length: 5 }, (_, i) => currentYear() - i);

  const runFilter = async () => {
    setLoading(true);
    try {
      if (tab === 'monthly') {
        const res = await api.get('/doctor/finance/monthly', { params: { year, month } });
        setConsults(res.data.consults);
      } else {
        const res = await api.get('/doctor/finance/summary', { params: { year, month } });
        setSummary(res.data);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Financial Statements</h1>

      <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
        {[{ key: 'monthly', label: 'Monthly List of Consults' }, { key: 'summary', label: 'Summary of Payments' }].map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setConsults(null); setSummary(null); }}
            className={`px-4 py-2 text-sm font-medium ${tab === t.key ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Year</label>
          <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Month</label>
          <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <button className="btn-primary" onClick={runFilter} disabled={loading}>{loading ? 'Filtering...' : 'Filter'}</button>
      </div>

      {tab === 'monthly' ? (
        <div className="card !p-0 overflow-x-auto">
          {consults === null ? (
            <p className="p-6 text-sm text-slate-400">Choose a year and month, then click Filter.</p>
          ) : consults.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">No consults recorded for {MONTHS[month - 1]} {year}.</p>
          ) : (
            <>
              <div className="flex items-center justify-between px-4 pt-4 pb-1">
                <span className="text-sm text-slate-500">{consults.length} consult{consults.length === 1 ? '' : 's'}</span>
                <button
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700 border border-brand-200 rounded-lg px-3 py-1.5 transition-colors"
                  onClick={() => downloadConsultsCsv(consults, `${MONTHS[month - 1]}-${year}`)}
                >
                  Download CSV
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Patient</th>
                    <th className="px-4 py-2 font-medium">Service</th>
                    <th className="px-4 py-2 font-medium">Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {consults.map((c, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3 whitespace-nowrap">{new Date(c.date).toLocaleDateString()}</td>
                      <td className="px-4 py-3">{c.patient}</td>
                      <td className="px-4 py-3">{c.service}</td>
                      <td className="px-4 py-3 tabular-nums">&#8377;{Number(c.fee).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 font-semibold">
                    <td className="px-4 py-3" colSpan={3}>Total</td>
                    <td className="px-4 py-3 tabular-nums">
                      &#8377;{consults.reduce((sum, c) => sum + Number(c.fee), 0).toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </div>
      ) : (
        <div className="card">
          {summary === null ? (
            <p className="text-sm text-slate-400">Choose a year and month, then click Filter.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Reveal className="relative overflow-hidden rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white px-5 py-5 shadow-card">
                <span className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10" />
                <span className="absolute -right-8 -bottom-8 h-24 w-24 rounded-full bg-white/5" />
                <div className="relative text-3xl font-display font-bold tabular-nums">
                  &#8377;<AnimatedNumber value={summary.totalEarnings} />
                </div>
                <div className="relative text-sm text-brand-50/90 mt-1">Total earnings &middot; {MONTHS[month - 1]} {year}</div>
              </Reveal>
              <Reveal delay={0.08} className="rounded-xl bg-slate-50 border border-slate-200 px-5 py-5">
                <div className="text-3xl font-display font-bold tabular-nums text-slate-800">
                  <AnimatedNumber value={summary.consultCount} />
                </div>
                <div className="text-sm text-slate-500 mt-1">Paid consultations</div>
              </Reveal>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
