import { useEffect, useState } from 'react';
import api from '../../../api/client';

export default function TicketsPanel() {
  const [tickets, setTickets] = useState([]);

  const load = () => api.get('/admin/tickets').then((res) => setTickets(res.data.tickets));
  useEffect(() => { load(); }, []);

  const resolve = async (id) => {
    await api.post(`/admin/tickets/${id}/resolve`);
    load();
  };

  return (
    <div className="card">
      <h2 className="font-semibold mb-3">Support tickets ({tickets.length})</h2>
      <div className="space-y-2">
        {tickets.map((t) => (
          <div key={t.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2">
            <span>
              <span className="font-mono">{t.reference}</span> — {t.category} — {t.account?.mobile}
              <div className="text-slate-400">{t.description}</div>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <span className={`badge ${t.status === 'RESOLVED' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{t.status}</span>
              {t.status !== 'RESOLVED' && (
                <button className="text-brand-600 text-xs font-medium" onClick={() => resolve(t.id)}>Resolve</button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
