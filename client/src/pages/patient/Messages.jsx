import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function Messages() {
  const { id } = useParams();
  const { account } = useAuth();
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  const load = () => api.get(`/appointments/${id}/messages`).then((res) => setMessages(res.data.messages));

  useEffect(() => {
    load().finally(() => setLoading(false));
    const interval = setInterval(load, 5000); // light polling for new messages
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    await api.post(`/appointments/${id}/messages`, { body });
    setBody('');
    await load();
  };

  if (loading) return <p className="text-slate-400">Loading messages...</p>;

  return (
    <div className="max-w-2xl mx-auto card flex flex-col h-[70vh]">
      <h1 className="font-semibold mb-3">Message Box</h1>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {messages.length === 0 && <p className="text-sm text-slate-400">No messages yet. Say hello!</p>}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
              m.senderId === account.id ? 'bg-brand-500 text-white ml-auto' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {m.body}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 mt-3">
        <input className="input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type a message..." />
        <button className="btn-primary" disabled={!body.trim()}>Send</button>
      </form>
    </div>
  );
}
