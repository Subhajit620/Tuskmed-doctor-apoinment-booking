import { useEffect, useState } from 'react';
import api, { apiErrorMessage } from '../../../api/client';

const emptyForm = { code: '', discountPct: '', expiry: '', maxUses: '' };

export default function PromoCodesPanel() {
  const [promoCodes, setPromoCodes] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/admin/promo-codes').then((res) => setPromoCodes(res.data.promoCodes));
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/admin/promo-codes', {
        code: form.code,
        discountPct: Number(form.discountPct),
        expiry: form.expiry,
        maxUses: form.maxUses ? Number(form.maxUses) : undefined,
      });
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (promo) => {
    await api.put(`/admin/promo-codes/${promo.id}`, { active: !promo.active });
    load();
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="card space-y-3">
        <h2 className="font-semibold">Create a promo code</h2>
        <form onSubmit={submit} className="space-y-3">
          <input className="input" placeholder="CODE" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          <div className="grid grid-cols-2 gap-3">
            <input className="input" type="number" placeholder="Discount %" required value={form.discountPct} onChange={(e) => setForm({ ...form, discountPct: e.target.value })} />
            <input className="input" type="number" placeholder="Max uses" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
          </div>
          <input className="input" type="date" required value={form.expiry} onChange={(e) => setForm({ ...form, expiry: e.target.value })} />
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <button className="btn-primary w-full" disabled={busy}>Create</button>
        </form>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">All promo codes</h2>
        <div className="space-y-2">
          {promoCodes.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2">
              <span className="font-mono">{p.code} — {p.discountPct}% off, expires {new Date(p.expiry).toLocaleDateString()}</span>
              <button
                className={`badge ${p.active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}
                onClick={() => toggleActive(p)}
              >
                {p.active ? 'Active' : 'Inactive'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
