import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
        <h1 className="font-semibold">Message Box</h1>
        <Link
          to={`/consultation/${id}`}
          className="btn-primary !px-3 !py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700"
        >
          🎥 Join Video Consultation
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {messages.length === 0 && <p className="text-sm text-slate-400">No messages yet. Say hello!</p>}
        {messages.map((m) => {
          const isSystem = m.senderId === 'SYSTEM_PATIENT' || m.senderId === 'SYSTEM_DOCTOR';
          const isMe = !isSystem && m.senderId === account?.id;
          const hasVideoLink = /\/consultation\/[a-zA-Z0-9-]+/.test(m.body || '');
          const urlRegex = /(https?:\/\/[^\s]+|\/consultation\/[a-zA-Z0-9-]+)/g;
          const parts = String(m.body || '').split(urlRegex);

          return (
            <div
              key={m.id}
              className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words ${
                isMe
                  ? 'bg-brand-500 text-white ml-auto'
                  : isSystem
                  ? 'bg-emerald-50/70 text-slate-800 border border-emerald-200'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              <div>
                {parts.map((part, idx) => {
                  if (/^(https?:\/\/[^\s]+|\/consultation\/[a-zA-Z0-9-]+)$/.test(part)) {
                    const match = part.match(/\/consultation\/([a-zA-Z0-9-]+)/);
                    if (match) {
                      return (
                        <Link key={idx} to={`/consultation/${match[1]}`} className="underline font-bold text-emerald-700">
                          {part}
                        </Link>
                      );
                    }
                    return (
                      <a key={idx} href={part} target="_blank" rel="noreferrer" className="underline font-bold">
                        {part}
                      </a>
                    );
                  }
                  return <span key={idx}>{part}</span>;
                })}
              </div>
              {hasVideoLink && (
                <div className="mt-2 pt-2 border-t border-emerald-200/80">
                  <Link
                    to={`/consultation/${id}`}
                    className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg"
                  >
                    🎥 Join Video Consultation Room &rarr;
                  </Link>
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 mt-3">
        <input className="input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type a message..." />
        <button className="btn-primary" disabled={!body.trim()}>Send</button>
      </form>
    </div>
  );
}

