import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { AnimatePresence, motion } from '../../components/motion';

export default function MessageBox() {
  const { id: urlApptId } = useParams();
  const { account, activePatient } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [selectedApptId, setSelectedApptId] = useState(urlApptId || null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [loadingAppts, setLoadingAppts] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showMobileChat, setShowMobileChat] = useState(!!urlApptId);
  const bottomRef = useRef(null);
  const navigate = useNavigate();

  // Load all appointments for the patient
  useEffect(() => {
    if (!activePatient) {
      setLoadingAppts(false);
      return;
    }

    setLoadingAppts(true);
    api
      .get('/appointments/mine')
      .then((res) => {
        const list = res.data.appointments || [];
        setAppointments(list);
        if (!selectedApptId && list.length > 0) {
          setSelectedApptId(list[0].id);
        }
      })
      .catch(() => setAppointments([]))
      .finally(() => setLoadingAppts(false));
  }, [activePatient]);

  // Sync if URL param changes
  useEffect(() => {
    if (urlApptId) {
      setSelectedApptId(urlApptId);
      setShowMobileChat(true);
    }
  }, [urlApptId]);

  // Load messages for the selected appointment
  const loadMessages = async (apptId) => {
    if (!apptId) return;
    try {
      const res = await api.get(`/appointments/${apptId}/messages`);
      setMessages(res.data.messages || []);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    if (!selectedApptId) return;

    setLoadingMsgs(true);
    loadMessages(selectedApptId).finally(() => setLoadingMsgs(false));

    // Polling interval for live chat
    const interval = setInterval(() => {
      loadMessages(selectedApptId);
    }, 4000);

    return () => clearInterval(interval);
  }, [selectedApptId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectConversation = (apptId) => {
    setSelectedApptId(apptId);
    setShowMobileChat(true);
    navigate(`/patient/messages/${apptId}`, { replace: true });
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!body.trim() || !selectedApptId) return;

    const textToSend = body.trim();
    setBody('');
    setSending(true);
    setError('');

    try {
      const res = await api.post(`/appointments/${selectedApptId}/messages`, { body: textToSend });
      setMessages((prev) => [...prev, res.data.message]);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const selectedAppt = appointments.find((a) => a.id === selectedApptId) || null;

  return (
    <div className="w-full space-y-8 font-sans">
      {/* Top Hero Banner in Warm Beige / Caramel Style */}
      <div className="w-full bg-[#EED8C5]/30 rounded-[32px] p-6 sm:p-10 border border-[#E9D5C2] relative overflow-hidden shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="h-[2px] w-6 bg-[#CAA067]" />
              <span className="text-[12px] sm:text-[13px] font-bold tracking-widest uppercase text-[#CAA067]">
                DOCTOR CONSULTATIONS
              </span>
            </div>
            <h1 className="text-[28px] sm:text-[36px] font-black text-[#2B434C] font-display tracking-tight leading-tight">
              Message <span className="italic font-serif text-[#CAA067]">Center</span>
            </h1>
            <p className="text-[#64748B] text-[13.5px] sm:text-[15px] font-medium max-w-xl leading-relaxed">
              Encrypted direct messaging with your consulting specialists, real-time follow-ups, and post-consultation care.
            </p>
          </div>

          {/* Quick Action or Video Room Pill */}
          {selectedAppt && selectedAppt.mode === 'VIDEO' && selectedAppt.status === 'CONFIRMED' && (
            <Link
              to={`/consultation/${selectedAppt.id}`}
              className="bg-[#CAA067] hover:bg-[#B88F55] active:scale-[0.99] text-white py-3 px-6 rounded-full font-bold text-[14px] shadow-xs hover:shadow-md transition-all flex items-center gap-2.5 self-start md:self-auto cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
              <span>Join Video Room</span>
            </Link>
          )}
        </div>
      </div>

      {loadingAppts ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-[#EDE2D5] shadow-xs text-slate-400 font-medium">
          Loading doctor conversations...
        </div>
      ) : appointments.length === 0 ? (
        /* Empty State with Continuous Orbit Animations */
        <div className="w-full bg-white rounded-[32px] p-10 sm:p-16 border border-[#EDE2D5] shadow-sm relative overflow-hidden flex flex-col items-center justify-center text-center">
          
          {/* Animated Planetary Orbit */}
          <div className="relative my-8 flex items-center justify-center">
            {/* Outer Rotating Ring */}
            <div className="w-48 h-48 rounded-full border border-[#CAA067]/30 flex items-start justify-center animate-orbit-slow pointer-events-none">
              <span className="w-3.5 h-3.5 rounded-full bg-[#CAA067] -mt-[7px] ring-4 ring-[#CAA067]/20 shadow-xs" />
            </div>

            {/* Inner Reverse Dashed Ring */}
            <div className="absolute w-56 h-56 rounded-full border border-dashed border-[#CAA067]/20 flex items-end justify-center animate-orbit-reverse pointer-events-none">
              <span className="w-2.5 h-2.5 rounded-full bg-[#DEC39E] -mb-[5px]" />
            </div>

            {/* Central Circle Badge with Smooth Zoom */}
            <div className="group absolute w-24 h-24 rounded-full bg-[#FAF3EC] border border-[#E9D5C2] flex items-center justify-center shadow-xs cursor-pointer transition-all duration-300 hover:scale-115 hover:shadow-xl hover:bg-[#FFFBF5]">
              <svg viewBox="0 0 24 24" fill="none" stroke="#CAA067" strokeWidth="2.2" className="w-10 h-10 pointer-events-none">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
          </div>

          <h2 className="text-2xl font-black text-[#2B434C] font-display">No active conversations yet</h2>
          <p className="text-slate-500 text-[14.5px] max-w-md mx-auto mt-2 font-medium leading-relaxed">
            Book an appointment with one of our certified specialists to enable real-time messaging, prescriptions, and digital follow-ups.
          </p>
          <Link
            to="/patient/doctors"
            className="mt-6 bg-[#CAA067] hover:bg-[#B88F55] active:scale-[0.99] text-white py-3 px-8 rounded-full font-bold text-[15px] shadow-xs hover:shadow-md transition-all inline-flex items-center gap-2"
          >
            <span>Find a Doctor & Consult</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>
      ) : (
        /* Premium Dual-Pane Chat Hub */
        <div className="grid grid-cols-1 md:grid-cols-12 bg-white rounded-[32px] border border-[#EDE2D5] shadow-[0_4px_24px_rgba(0,0,0,0.03)] overflow-hidden h-[76vh]">
          
          {/* Left Column: Doctor Conversation Threads List */}
          <div
            className={`md:col-span-4 border-r border-[#EFE5DB] flex-col bg-[#FDFBF9] ${
              showMobileChat ? 'hidden md:flex' : 'flex'
            }`}
          >
            <div className="p-4 sm:p-5 border-b border-[#EFE5DB] bg-[#FAF3EC]/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#CAA067] text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                  {appointments.length}
                </div>
                <h2 className="font-bold text-[15px] text-[#2B434C] font-display">Doctor Threads</h2>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#F0E6DC]/60 p-2 space-y-1">
              {appointments.map((appt) => {
                const isSelected = appt.id === selectedApptId;
                const startDate = new Date(appt.slot?.start || appt.createdAt);
                const docInitials = appt.doctor?.name
                  ? appt.doctor.name.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('')
                  : 'DR';

                return (
                  <button
                    key={appt.id}
                    onClick={() => handleSelectConversation(appt.id)}
                    className={`group w-full text-left p-3.5 sm:p-4 rounded-2xl flex items-start gap-3.5 transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? 'bg-[#FAF3EC] border border-[#E9D5C2] shadow-xs'
                        : 'hover:bg-[#F7EFE8]/70 border border-transparent'
                    }`}
                  >
                    {/* Doctor Circular Avatar Badge with Zoom Interaction */}
                    <div className="w-12 h-12 rounded-full bg-[#CAA067] text-white flex items-center justify-center font-bold text-[14px] shrink-0 shadow-xs transition-transform duration-300 group-hover:scale-110">
                      {docInitials}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h3 className="font-bold text-[#2B434C] text-[14px] truncate">
                          {appt.doctor?.name}
                        </h3>
                        <span className="text-[11px] font-semibold text-[#8B9EA8] shrink-0">
                          {startDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <p className="text-[12px] text-[#CAA067] font-semibold truncate mt-0.5">
                        {appt.doctor?.speciality}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`h-2 w-2 rounded-full ${appt.status === 'CONFIRMED' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        <span className="text-[11px] font-medium text-slate-500">
                          {appt.mode === 'VIDEO' ? 'Video' : 'In-Clinic'} &middot; {appt.status}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Active Conversation Messages Stream */}
          <div
            className={`md:col-span-8 flex-col bg-white h-full ${
              showMobileChat ? 'flex' : 'hidden md:flex'
            }`}
          >
            {selectedAppt ? (
              <>
                {/* Chat Top Bar */}
                <div className="p-4 sm:px-6 border-b border-[#EFE5DB] flex items-center justify-between bg-[#FAF3EC]/40 shadow-2xs">
                  <div className="flex items-center gap-3">
                    {/* Mobile Back Button */}
                    <button
                      onClick={() => setShowMobileChat(false)}
                      className="md:hidden h-8 w-8 rounded-full bg-white border border-[#E9D5C2] flex items-center justify-center text-[#2B434C] font-bold shadow-2xs"
                      title="Back to conversations"
                    >
                      ←
                    </button>
                    {/* Doctor Circular Avatar */}
                    <div className="w-11 h-11 rounded-full bg-[#CAA067] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                      {selectedAppt.doctor?.name
                        ? selectedAppt.doctor.name.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('')
                        : 'DR'}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-[#2B434C] text-[15px] sm:text-[16px] truncate">{selectedAppt.doctor?.name}</h3>
                      <p className="text-[12px] text-[#CAA067] font-semibold truncate">
                        {selectedAppt.doctor?.speciality} &middot; <span className="text-slate-400 font-normal">Appt #{selectedAppt.id.slice(0, 8)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedAppt.mode === 'VIDEO' && selectedAppt.status === 'CONFIRMED' && (
                      <Link
                        to={`/consultation/${selectedAppt.id}`}
                        className="text-xs sm:text-[13px] bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-full font-bold shadow-2xs transition-colors flex items-center gap-1.5"
                      >
                        <span>🎥</span>
                        <span>Join Video Call</span>
                      </Link>
                    )}
                    <Link
                      to={`/patient/appointments/${selectedAppt.id}`}
                      className="text-xs sm:text-[13px] bg-white border border-[#E9D5C2] text-[#2B434C] hover:bg-[#FAF3EC] px-3.5 py-1.5 rounded-full font-bold shadow-2xs transition-colors"
                    >
                      Visit Details
                    </Link>
                  </div>
                </div>

                {/* Messages Feed Area */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 bg-[#FAF3EC]/20">
                  {loadingMsgs ? (
                    <div className="flex justify-center items-center h-32 text-xs text-slate-400 font-medium">
                      Loading messages...
                    </div>
                  ) : messages.length === 0 ? (
                    /* Empty Message State with Zooming Circle Icon */
                    <div className="text-center py-12 space-y-3">
                      <div className="group w-14 h-14 mx-auto rounded-full bg-[#FAF3EC] border border-[#E9D5C2] flex items-center justify-center shadow-xs cursor-pointer transition-all duration-300 hover:scale-120 hover:shadow-md">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#CAA067" strokeWidth="2.2" className="w-6 h-6 pointer-events-none">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-[#2B434C]">No messages in this consultation yet</p>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                        Send a message directly to Dr. {selectedAppt.doctor?.name} regarding your health concern or questions.
                      </p>
                    </div>
                  ) : (
                    messages.map((m) => {
                      const isSystem = m.senderId === 'SYSTEM_PATIENT' || m.senderId === 'SYSTEM_DOCTOR';
                      const isMe = !isSystem && (m.senderId === account?.id || m.senderRole === 'PATIENT');
                      const hasVideoLink = /\/consultation\/[a-zA-Z0-9-]+/.test(m.body || '') || (isSystem && selectedAppt?.mode === 'VIDEO');
                      const msgTime = new Date(m.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      // Turn URLs inside message text into clickable links
                      const urlRegex = /(https?:\/\/[^\s]+|\/consultation\/[a-zA-Z0-9-]+)/g;
                      const parts = String(m.body || '').split(urlRegex);

                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[85%] sm:max-w-[72%] rounded-2xl px-4 py-3 text-[13.5px] sm:text-[14px] shadow-2xs font-medium ${
                              isMe
                                ? 'bg-[#CAA067] text-white rounded-br-xs'
                                : isSystem
                                ? 'bg-gradient-to-br from-white to-[#FAF3EC] text-[#2B434C] border-2 border-[#CAA067]/50 rounded-bl-xs shadow-sm'
                                : 'bg-white text-[#2B434C] border border-[#EDE2D5] rounded-bl-xs'
                            }`}
                          >
                            <p className="whitespace-pre-wrap leading-relaxed break-words">
                              {parts.map((part, idx) => {
                                if (/^(https?:\/\/[^\s]+|\/consultation\/[a-zA-Z0-9-]+)$/.test(part)) {
                                  const match = part.match(/\/consultation\/([a-zA-Z0-9-]+)/);
                                  if (match) {
                                    return (
                                      <Link
                                        key={idx}
                                        to={`/consultation/${match[1]}`}
                                        className={`underline font-bold ${isMe ? 'text-white' : 'text-emerald-700 hover:text-emerald-800'}`}
                                      >
                                        {part}
                                      </Link>
                                    );
                                  }
                                  return (
                                    <a
                                      key={idx}
                                      href={part}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={`underline font-bold ${isMe ? 'text-white' : 'text-[#CAA067]'}`}
                                    >
                                      {part}
                                    </a>
                                  );
                                }
                                return <span key={idx}>{part}</span>;
                              })}
                            </p>

                            {hasVideoLink && selectedAppt?.status === 'CONFIRMED' && (
                              <div className="mt-3 pt-2.5 border-t border-[#E9D5C2]/80">
                                <Link
                                  to={`/consultation/${selectedAppt.id}`}
                                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition-all"
                                >
                                  <span>🎥</span>
                                  <span>Join Video Consultation Room</span>
                                  <span>&rarr;</span>
                                </Link>
                              </div>
                            )}

                            <div
                              className={`text-[10.5px] mt-1 font-semibold text-right ${
                                isMe ? 'text-[#FAF3EC]/90' : 'text-slate-400'
                              }`}
                            >
                              {msgTime}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={bottomRef} />
                </div>

                {error && (
                  <div className="px-4 py-2 bg-red-50 text-red-600 text-xs border-t border-red-200 text-center font-medium">
                    ⚠️ {error}
                  </div>
                )}

                {/* Message Input Bar with Rounded Pill Layout */}
                <form onSubmit={sendMessage} className="p-3 sm:p-4 border-t border-[#EFE5DB] bg-white flex items-center gap-3">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder={`Message Dr. ${selectedAppt.doctor?.name || 'Doctor'}...`}
                      className="w-full bg-[#FAF3EC]/50 border border-[#E9D5C2] rounded-full px-5 py-3 text-[14px] text-[#2B434C] font-medium placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#CAA067]/40 focus:border-[#CAA067] transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={sending || !body.trim()}
                    className="bg-[#CAA067] hover:bg-[#B88F55] active:scale-[0.99] text-white py-3 px-6 rounded-full font-bold text-[14px] shadow-xs hover:shadow-md transition-all duration-200 disabled:opacity-50 flex items-center gap-2 shrink-0 cursor-pointer"
                  >
                    <span>{sending ? 'Sending…' : 'Send'}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm p-4 text-center font-medium">
                Select a doctor thread on the left to start messaging.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
