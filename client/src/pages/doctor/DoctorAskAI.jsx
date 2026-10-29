import { useEffect, useRef, useState } from 'react';
import api, { apiErrorMessage } from '../../api/client';
import { Reveal } from '../../components/motion';

const SUGGESTED_PROMPTS = [
  'Latest first-line options for managing hypertension',
  'Key drug interactions to check before prescribing NSAIDs',
  'Differential diagnosis checklist for acute chest pain',
  'Recommended follow-up interval after a knee replacement',
];

export default function DoctorAskAI() {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]); // { role: 'user' | 'assistant' | 'error', text }
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const ask = async (text) => {
    const q = (text ?? question).trim();
    if (!q || busy) return;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setQuestion('');
    setBusy(true);
    try {
      const res = await api.post('/doctor/ask-ai', { question: q });
      setMessages((m) => [...m, { role: 'assistant', text: res.data.answer }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'error', text: apiErrorMessage(err) }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Ask Gen AI</h1>
        <p className="text-sm text-slate-500 mt-1">A quick clinical reference assistant - not a substitute for your judgment.</p>
      </div>

      {messages.length === 0 ? (
        <Reveal className="flex flex-wrap justify-center gap-2">
          {SUGGESTED_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => ask(p)}
              className="text-xs font-medium px-3 py-2 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-brand-300 transition-colors text-left"
            >
              {p}
            </button>
          ))}
        </Reveal>
      ) : (
        <div ref={scrollRef} className="card !p-4 space-y-3 max-h-[26rem] overflow-y-auto">
          {messages.map((m, i) => (
            <Reveal key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-brand-600 text-white rounded-br-sm'
                    : m.role === 'error'
                    ? 'bg-red-50 text-red-700 border border-red-200 rounded-bl-sm'
                    : 'bg-slate-50 text-slate-700 border border-slate-100 rounded-bl-sm'
                }`}
              >
                {m.text}
              </div>
            </Reveal>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-bl-sm px-4 py-2.5 flex gap-1 items-center">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: `${i * 0.12}s` }} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Ask any clinical reference question..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask()}
        />
        <button
          className="btn px-6 bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40"
          disabled={busy || !question.trim()}
          onClick={() => ask()}
        >
          {busy ? '...' : 'Ask'}
        </button>
        {messages.length > 0 && (
          <button className="btn-secondary" onClick={() => setMessages([])} title="Clear conversation">
            Clear
          </button>
        )}
      </div>

      <div className="text-xs text-slate-400 border-t border-slate-100 pt-4 space-y-1">
        <p>
          <strong>Clinical responsibility:</strong> Gen AI answers are general reference material, not medical advice.
          You remain solely responsible for every diagnostic and treatment decision.
        </p>
        <p>
          <strong>Privacy:</strong> Do not enter any identifiable patient information (name, contact details, appointment
          or record IDs) into this box.
        </p>
      </div>
    </div>
  );
}
