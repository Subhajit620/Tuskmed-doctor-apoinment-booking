import { useEffect, useState } from 'react';
import api, { apiErrorMessage } from '../../api/client';

export default function Support() {
  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastTicket, setLastTicket] = useState(null);

  const loadTickets = () => api.get('/support/tickets/mine').then((res) => setTickets(res.data.tickets));

  useEffect(() => {
    api.get('/support/channels').then((res) => {
      setChannels(res.data.channels);
      setCategories(res.data.categories);
      setCategory(res.data.categories[0]);
    });
    loadTickets();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api.post('/support/tickets', { category, description });
      setLastTicket(res.data.ticket);
      setDescription('');
      await loadTickets();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Help & Support</h1>

      <div className="card">
        <h2 className="font-semibold mb-3">Contact us directly</h2>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          {channels.map((c) => (
            <div key={c.type} className="rounded-lg border border-slate-200 p-3">
              <div className="font-medium">{c.label}</div>
              <div className="text-slate-500">{c.value}</div>
            </div>
          ))}
        </div>
      </div>


    </div>
  );
}
