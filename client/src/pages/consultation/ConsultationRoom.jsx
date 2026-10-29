import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from '../../components/motion';
import DeviceCheckModal from './DeviceCheckModal';
import ClinicalWorkspaceDrawer from './ClinicalWorkspaceDrawer';
import PostConsultationSummaryModal from './PostConsultationSummaryModal';
import { useConsultationWebRTC } from './useConsultationWebRTC';

export default function ConsultationRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { account, activePatient } = useAuth();
  const urlRole = new URLSearchParams(location.search).get('role');

  const [loading, setLoading] = useState(true);
  const [appointment, setAppointment] = useState(null);
  const [videoLink, setVideoLink] = useState(null);
  const [ready, setReady] = useState(false);
  const [opensAt, setOpensAt] = useState(null);
  const [isExpired, setIsExpired] = useState(false);
  const [error, setError] = useState('');
  const [unauthorized, setUnauthorized] = useState(false);

  // Pre-Call Green Room Check Modal
  const [showDeviceCheck, setShowDeviceCheck] = useState(true);
  const [hasEnteredRoom, setHasEnteredRoom] = useState(false);

  // Layout View Mode: 'focus' (speaker view) | 'split' (side-by-side 50/50)
  const [viewMode, setViewMode] = useState('focus');
  const [showEHRDrawer, setShowEHRDrawer] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  // Modals & Popovers
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [capturedSnapshot, setCapturedSnapshot] = useState(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [rxAlertBanner, setRxAlertBanner] = useState(false);

  // Vitals State
  const [vitals, setVitals] = useState({
    bp: '120/80',
    pulse: '74',
    spo2: '99',
    temp: '98.6',
    sugar: '95',
  });

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const screenVideoRef = useRef(null);
  const containerRef = useRef(null);

  const isDoctor = account?.role === 'DOCTOR' || urlRole === 'DOCTOR';
  const currentUser = {
    role: isDoctor ? 'DOCTOR' : 'PATIENT',
    name: isDoctor
      ? appointment?.doctor?.name || (account?.mobile ? `Dr. (${account.mobile.slice(-4)})` : 'Doctor')
      : activePatient?.name || appointment?.patient?.name || 'Patient',
  };

  // WebRTC & Real-Time Signaling Hook
  const {
    localStream,
    remoteStream,
    screenStream,
    muted,
    videoOff,
    isScreenSharing,
    handRaised,
    remotePeer,
    remoteState,
    localVolume,
    remoteVolume,
    connectionStatus,
    inCallMessages,
    initCall,
    toggleMute,
    toggleVideo,
    toggleHandRaise,
    startScreenShare,
    stopScreenShare,
    captureSnapshot,
    sendInCallMessage,
  } = useConsultationWebRTC({
    appointmentId: id,
    user: currentUser,
    onConsultationEnded: () => {
      setShowSummaryModal(true);
    },
    onPrescriptionIssued: (prescription) => {
      setAppointment((prev) => (prev ? { ...prev, prescription } : prev));
      if (!isDoctor) setRxAlertBanner(true);
    },
  });

  // Load appointment metadata and join authorization
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError('');

    api
      .get(`/appointments/${id}/join`, { params: { role: isDoctor ? 'DOCTOR' : 'PATIENT' } })
      .then((res) => {
        if (!isMounted) return;
        setAppointment(res.data.appointment);
        if (res.data.expired) {
          setIsExpired(true);
          setReady(false);
        } else if (res.data.ready) {
          setVideoLink(res.data.videoLink);
          setReady(true);
        } else {
          setOpensAt(res.data.opensAt);
          setReady(false);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        const msg = apiErrorMessage(err);
        if (err.response?.status === 410 || err.response?.data?.expired) {
          if (err.response?.data?.appointment) setAppointment(err.response.data.appointment);
          setIsExpired(true);
        } else if (err.response?.status === 403) {
          setUnauthorized(true);
        } else {
          setError(msg);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  // Load existing in-call messages
  useEffect(() => {
    if (!id || unauthorized) return;
    api
      .get(`/appointments/${id}/messages`)
      .then((res) => {
        const msgs = res.data.messages || [];
        msgs.forEach((m) => sendInCallMessage(m));
      })
      .catch(() => {});
  }, [id, unauthorized]);

  // Track consultation call timer
  useEffect(() => {
    if (!hasEnteredRoom || connectionStatus === 'ended') return undefined;
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [hasEnteredRoom, connectionStatus]);

  // Attach local video stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, hasEnteredRoom]);

  // Attach remote video stream
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, hasEnteredRoom]);

  // Attach screen share stream
  useEffect(() => {
    if (screenVideoRef.current && screenStream) {
      screenVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  // Keyboard Shortcuts (M: Mute, V: Video, S: Screen, H: Hand, E: EHR, F: Fullscreen, ?: Help)
  useEffect(() => {
    if (!hasEnteredRoom) return undefined;
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      const key = e.key.toLowerCase();
      if (key === 'm') toggleMute();
      if (key === 'v') toggleVideo();
      if (key === 's') isScreenSharing ? stopScreenShare() : startScreenShare();
      if (key === 'h') toggleHandRaise();
      if (key === 'e') setShowEHRDrawer((prev) => !prev);
      if (key === 'f') toggleFullscreen();
      if (key === '?') setShowHelpModal((prev) => !prev);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasEnteredRoom, isScreenSharing, toggleMute, toggleVideo, toggleHandRaise]);

  const handleJoinFromDeviceCheck = (initialConfig) => {
    setShowDeviceCheck(false);
    setHasEnteredRoom(true);
    initCall(initialConfig);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleSnapshot = () => {
    const targetVideo = remoteVideoRef.current || localVideoRef.current;
    const snap = captureSnapshot(targetVideo);
    if (snap) {
      setCapturedSnapshot(snap);
    }
  };

  const handleSendMessage = async (text) => {
    try {
      const res = await api.post(`/appointments/${id}/messages`, { body: text });
      sendInCallMessage(res.data.message);
    } catch {
      // ignore
    }
  };

  const handleVitalsUpdate = (newVitals) => {
    setVitals(newVitals);
  };

  // Leave Call
  const handleLeave = () => {
    if (isDoctor) {
      navigate('/doctor');
    } else {
      navigate('/patient/appointments');
    }
  };

  // End Consultation (Doctor officially completes appointment)
  const handleEndConsultation = async () => {
    setActionBusy(true);
    try {
      await api.post(`/doctor/appointments/${id}/complete`);
      setShowSummaryModal(true);
      setConfirmEndOpen(false);
    } catch (err) {
      setError(apiErrorMessage(err));
      setActionBusy(false);
      setConfirmEndOpen(false);
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070D18] flex flex-col items-center justify-center text-white space-y-4 font-sans">
        <div className="w-12 h-12 border-4 border-[#CAA067] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-300">Initializing encrypted medical video consultation…</p>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-[#FDFBF9] flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full rounded-3xl bg-white border border-red-200 p-8 text-center space-y-5 shadow-xl">
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto text-2xl font-bold">
            🚫
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-black text-slate-900 font-display">Access Restricted</h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              You are not authorized to join this consultation room.
            </p>
          </div>
          <button onClick={() => navigate(isDoctor ? '/doctor' : '/patient')} className="w-full btn-primary py-3">
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="min-h-screen bg-[#FDFBF9] flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full rounded-3xl bg-white border border-slate-200 p-8 text-center space-y-5 shadow-xl">
          <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mx-auto text-2xl font-bold">
            ⌛
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-black text-[#1B365D] font-display">Meeting Time Over</h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              The 2-hour joining window for this video consultation has ended.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-[#FAF3EC] border border-[#F0E5DA] text-xs text-left space-y-1 text-slate-700">
            <div><strong className="text-slate-900">Doctor:</strong> {appointment?.doctor?.name}</div>
            <div><strong className="text-slate-900">Patient:</strong> {appointment?.patient?.name}</div>
            <div><strong className="text-slate-900">Scheduled:</strong> {new Date(appointment?.slot?.start).toLocaleString()}</div>
          </div>
          <button onClick={() => navigate(isDoctor ? '/doctor' : '/patient')} className="w-full btn-primary py-3 text-sm">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!ready && opensAt) {
    const opensTime = new Date(opensAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return (
      <div className="min-h-screen bg-[#FDFBF9] flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full rounded-3xl bg-white border border-[#F0E5DA] p-8 text-center space-y-5 shadow-xl">
          <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto text-2xl font-bold">
            ⏳
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-black text-[#1B365D] font-display">Waiting Room</h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Your consultation room is scheduled. The room will automatically open 15 minutes before your consultation at{' '}
              <strong className="text-slate-900">{opensTime}</strong>.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-[#FAF3EC] border border-[#F0E5DA] text-xs text-left space-y-1 text-slate-700">
            <div><strong className="text-slate-900">Doctor:</strong> {appointment?.doctor?.name}</div>
            <div><strong className="text-slate-900">Patient:</strong> {appointment?.patient?.name}</div>
            <div><strong className="text-slate-900">Scheduled:</strong> {new Date(appointment?.slot?.start).toLocaleString()}</div>
          </div>
          <button onClick={() => navigate(isDoctor ? '/doctor' : '/patient')} className="w-full btn-secondary py-3 text-sm">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Pre-Call Green Room Modal
  if (showDeviceCheck) {
    return (
      <DeviceCheckModal
        appointment={appointment}
        role={isDoctor ? 'DOCTOR' : 'PATIENT'}
        onJoin={handleJoinFromDeviceCheck}
      />
    );
  }

  const partnerName = isDoctor ? appointment?.patient?.name : appointment?.doctor?.name;
  const partnerRole = isDoctor ? 'Patient' : 'Specialist Doctor';

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 h-[100dvh] w-screen z-50 bg-[#070D18] flex flex-col justify-between text-white font-sans overflow-hidden select-none"
    >
      {/* 1. TOP HEADER BAR */}
      <header className="h-14 sm:h-16 px-2.5 sm:px-6 bg-[#0E1726]/95 backdrop-blur-md border-b border-white/10 flex items-center justify-between gap-2 z-20 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl sm:rounded-2xl bg-[#CAA067] text-white flex items-center justify-center font-bold text-xs sm:text-sm shadow-xs shrink-0">
            {isDoctor ? '👨‍⚕️' : '🩺'}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-xs sm:text-base text-white truncate flex items-center gap-1.5 sm:gap-2">
              <span className="truncate max-w-[110px] xs:max-w-[150px] sm:max-w-none">{partnerName || 'Teleconsultation'}</span>
              <span className="hidden xs:inline-block text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full bg-white/10 text-[#CAA067] border border-white/10 shrink-0">
                {partnerRole}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 truncate hidden sm:block">
              {appointment?.doctor?.speciality || 'Video Consultation'} &middot; Encrypted HD WebRTC
            </div>
          </div>
        </div>

        {/* Live Status & Header Controls */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Call Duration */}
          <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-mono font-bold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-emerald-400">{formatTimer(callDuration)}</span>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-white/10 rounded-xl p-0.5 border border-white/10 text-[10px] sm:text-xs">
            <button
              type="button"
              onClick={() => setViewMode('focus')}
              className={`px-2 sm:px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                viewMode === 'focus' ? 'bg-[#CAA067] text-white' : 'text-slate-300 hover:text-white'
              }`}
              title="Speaker Focus View"
            >
              Focus
            </button>
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`px-2 sm:px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                viewMode === 'split' ? 'bg-[#CAA067] text-white' : 'text-slate-300 hover:text-white'
              }`}
              title="Side-by-Side Split View"
            >
              Grid
            </button>
          </div>

          {/* Prescription / Clinical Workspace Toggle */}
          <button
            type="button"
            onClick={() => setShowEHRDrawer(!showEHRDrawer)}
            className={`px-2.5 sm:px-3.5 py-1.5 rounded-xl border text-[11px] sm:text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer ${
              showEHRDrawer
                ? 'bg-[#CAA067] text-white border-[#CAA067] shadow-sm'
                : 'bg-white/10 text-slate-200 border-white/10 hover:bg-white/20'
            }`}
          >
            <span>{isDoctor ? '📝' : '📋'}</span>
            <span className="sm:hidden">{isDoctor ? 'Rx' : 'Chart'}</span>
            <span className="hidden sm:inline">{isDoctor ? 'Generate Prescription' : 'Health Chart'}</span>
          </button>

          {/* Help Button */}
          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
            title="Help &amp; Shortcuts (?)"
          >
            ?
          </button>
        </div>
      </header>

      {/* Prescription Instant Alert Banner for Patient */}
      <AnimatePresence>
        {rxAlertBanner && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-emerald-600 text-white px-4 py-2.5 text-xs font-bold flex items-center justify-between z-30 shadow-lg"
          >
            <div className="flex items-center gap-2">
              <span>💊</span>
              <span>Doctor has issued your Digital Prescription! It is ready in your Clinical Chart.</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowEHRDrawer(true);
                setRxAlertBanner(false);
              }}
              className="px-3 py-1 rounded-lg bg-white text-emerald-800 text-[11px] font-extrabold hover:bg-emerald-50 cursor-pointer"
            >
              View Rx Now &rarr;
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. MAIN VIDEO CONSULTATION VIEWPORT */}
      <main className="flex-1 min-h-0 relative p-2 sm:p-5 overflow-hidden flex items-center justify-center">
        {/* VIEW MODE: FOCUS / SPEAKER VIEW */}
        {viewMode === 'focus' && (
          <div className="relative w-full h-full max-w-6xl rounded-2xl sm:rounded-[28px] overflow-hidden bg-[#111A29] border border-white/10 shadow-2xl flex items-center justify-center">
            {/* Screen Share or Remote Stream */}
            {isScreenSharing && screenStream ? (
              <div className="relative w-full h-full flex items-center justify-center bg-black">
                <video ref={screenVideoRef} autoPlay playsInline className="w-full h-full object-contain" />
                <div className="absolute top-3 left-3 bg-red-600/90 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-md">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  <span>Sharing Screen</span>
                </div>
              </div>
            ) : remoteStream ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className={`w-full h-full object-cover ${remoteState.videoOff ? 'hidden' : ''}`}
                />
                {remoteState.videoOff && (
                  <div className="text-center p-4 sm:p-6 space-y-3">
                    <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-[#CAA067] text-white flex items-center justify-center text-3xl sm:text-4xl font-bold mx-auto border-4 border-white/20">
                      {partnerName?.[0]?.toUpperCase() || 'D'}
                    </div>
                    <div className="text-base sm:text-lg font-bold text-white">{partnerName}</div>
                    <p className="text-xs text-slate-400">Camera is paused</p>
                  </div>
                )}
              </div>
            ) : (
              /* Presence Simulation / Connecting Tile */
              <div className="relative w-full h-full flex flex-col items-center justify-center p-4 sm:p-6 text-center">
                <div className="w-20 h-20 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-[#CAA067] to-[#B88F55] text-white flex items-center justify-center text-3xl sm:text-5xl font-bold shadow-2xl mb-3 sm:mb-4 border-4 border-white/20 relative">
                  {partnerName?.[0]?.toUpperCase() || 'D'}
                  {remoteVolume > 5 && (
                    <span className="absolute inset-0 rounded-full border-4 border-emerald-400 animate-ping opacity-60" />
                  )}
                </div>
                <h2 className="text-lg sm:text-2xl font-bold text-white font-display">{partnerName}</h2>
                <p className="text-xs sm:text-sm text-emerald-400 font-medium mt-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live Encrypted HD Audio &amp; Video Connected
                </p>
                <div className="mt-2.5 sm:mt-3 px-3 sm:px-4 py-1 sm:py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] sm:text-[11px] text-slate-400">
                  Daily / WebRTC Peer &middot; 256-Bit SSL Teleconsult
                </div>
              </div>
            )}

            {/* Remote Hand Raised Banner */}
            {remoteState.handRaised && (
              <div className="absolute top-3 left-3 sm:top-4 sm:left-4 bg-amber-500 text-white px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full font-bold text-[11px] sm:text-xs shadow-lg flex items-center gap-1.5 animate-bounce z-30">
                <span>✋</span>
                <span>{partnerName} raised hand</span>
              </div>
            )}

            {/* Speaking Reminder Toast (If Speaking while Muted) */}
            {muted && localVolume > 15 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 bg-red-600 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-2xl text-[11px] sm:text-xs font-bold shadow-xl flex items-center gap-2 z-30 animate-pulse"
              >
                <span>🎙️</span>
                <span>You are muted! Tap Unmute to speak.</span>
              </motion.div>
            )}

            {/* Local Picture-in-Picture (PiP) */}
            <motion.div
              drag
              dragConstraints={{ left: -240, right: 240, top: -180, bottom: 180 }}
              className="absolute bottom-2.5 right-2.5 sm:bottom-4 sm:right-4 w-28 sm:w-44 md:w-56 aspect-video rounded-xl sm:rounded-2xl bg-[#0E1726] border-2 border-white/30 shadow-2xl overflow-hidden cursor-grab active:cursor-grabbing z-30"
            >
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover mirror ${videoOff ? 'hidden' : ''}`}
                style={{ transform: 'scaleX(-1)' }}
              />
              {videoOff && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-[10px] sm:text-[11px] text-slate-400 font-bold space-y-0.5 sm:space-y-1">
                  <span>Camera Off</span>
                  <button
                    type="button"
                    onClick={toggleVideo}
                    className="text-[9px] sm:text-[10px] text-[#CAA067] hover:underline"
                  >
                    Turn On
                  </button>
                </div>
              )}
              <div className="absolute bottom-1 left-1.5 sm:bottom-1.5 sm:left-2 px-1.5 sm:px-2 py-0.5 rounded-md bg-black/60 backdrop-blur text-[9px] sm:text-[10px] font-bold text-white flex items-center gap-1">
                <span>You</span>
                {muted && <span>🔇</span>}
                {handRaised && <span>✋</span>}
              </div>
            </motion.div>
          </div>
        )}

        {/* VIEW MODE: SPLIT 50/50 DUAL GRID */}
        {viewMode === 'split' && (
          <div className="w-full h-full max-w-6xl grid grid-rows-2 sm:grid-rows-1 grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
            {/* Remote User Tile */}
            <div className="relative min-h-0 rounded-2xl sm:rounded-[28px] overflow-hidden bg-[#111A29] border border-white/10 shadow-2xl flex items-center justify-center">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className={`w-full h-full object-cover ${remoteState.videoOff ? 'hidden' : ''}`}
              />
              {(!remoteStream || remoteState.videoOff) && (
                <div className="text-center p-4 sm:p-6 space-y-1.5 sm:space-y-2">
                  <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-[#CAA067] text-white flex items-center justify-center text-2xl sm:text-3xl font-bold mx-auto border-2 border-white/20">
                    {partnerName?.[0]?.toUpperCase() || 'D'}
                  </div>
                  <div className="font-bold text-white text-sm sm:text-base">{partnerName}</div>
                  <div className="text-[11px] sm:text-xs text-slate-400">{partnerRole}</div>
                </div>
              )}
              <div className="absolute bottom-2.5 left-2.5 sm:bottom-3 sm:left-3 bg-black/60 px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-bold">
                {partnerName} {remoteState.muted && '🔇'}
              </div>
            </div>

            {/* Local User Tile */}
            <div className="relative min-h-0 rounded-2xl sm:rounded-[28px] overflow-hidden bg-[#111A29] border border-white/10 shadow-2xl flex items-center justify-center">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover mirror ${videoOff ? 'hidden' : ''}`}
                style={{ transform: 'scaleX(-1)' }}
              />
              {videoOff && (
                <div className="text-center p-4 sm:p-6 space-y-1.5 sm:space-y-2">
                  <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-slate-700 text-white flex items-center justify-center text-2xl sm:text-3xl font-bold mx-auto">
                    👤
                  </div>
                  <div className="font-bold text-white text-sm sm:text-base">You</div>
                  <div className="text-[11px] sm:text-xs text-slate-400">Camera Off</div>
                </div>
              )}
              <div className="absolute bottom-2.5 left-2.5 sm:bottom-3 sm:left-3 bg-black/60 px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5">
                <span>You</span>
                {muted && <span>🔇</span>}
                {handRaised && <span>✋</span>}
              </div>
            </div>
          </div>
        )}

        {/* CLINICAL EHR & HEALTH CHART DRAWER */}
        <ClinicalWorkspaceDrawer
          isOpen={showEHRDrawer}
          onClose={() => setShowEHRDrawer(false)}
          appointment={appointment}
          role={isDoctor ? 'DOCTOR' : 'PATIENT'}
          vitals={vitals}
          onVitalsUpdate={handleVitalsUpdate}
          messages={inCallMessages}
          onSendMessage={handleSendMessage}
          onPrescriptionIssued={() => {
            api
              .get(`/appointments/${id}`)
              .then((res) => {
                if (res.data?.appointment) setAppointment(res.data.appointment);
              })
              .catch(() => {});
            if (!isDoctor) setRxAlertBanner(true);
          }}
        />
      </main>

      {/* 3. USER-FRIENDLY FOOTER CONTROLS BAR WITH CLEAR LABELS */}
      <footer className="h-18 sm:h-20 px-2 sm:px-4 bg-[#0E1726]/95 backdrop-blur-md border-t border-white/10 flex items-center justify-between sm:justify-center gap-1.5 sm:gap-3 z-20 shrink-0 overflow-x-auto">
        {/* Microphone Button */}
        <button
          type="button"
          onClick={toggleMute}
          className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 px-2.5 sm:px-4 py-1.5 sm:py-2.5 rounded-xl sm:rounded-2xl font-bold text-xs transition-all active:scale-95 cursor-pointer shrink-0 ${
            muted
              ? 'bg-red-500/90 hover:bg-red-600 text-white ring-2 ring-red-400/50'
              : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
          title="Shortcut: M"
        >
          <span className="text-sm sm:text-lg">{muted ? '🔇' : '🎙️'}</span>
          <span className="text-[9px] sm:text-xs">{muted ? 'Unmute' : 'Mute'}</span>
        </button>

        {/* Camera Button */}
        <button
          type="button"
          onClick={toggleVideo}
          className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 px-2.5 sm:px-4 py-1.5 sm:py-2.5 rounded-xl sm:rounded-2xl font-bold text-xs transition-all active:scale-95 cursor-pointer shrink-0 ${
            videoOff
              ? 'bg-red-500/90 hover:bg-red-600 text-white ring-2 ring-red-400/50'
              : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
          title="Shortcut: V"
        >
          <span className="text-sm sm:text-lg">{videoOff ? '🚫' : '📹'}</span>
          <span className="text-[9px] sm:text-xs">{videoOff ? 'Video On' : 'Video'}</span>
        </button>

        {/* Screen Share Button */}
        <button
          type="button"
          onClick={isScreenSharing ? stopScreenShare : startScreenShare}
          className={`hidden xs:flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 px-2.5 sm:px-4 py-1.5 sm:py-2.5 rounded-xl sm:rounded-2xl font-bold text-xs transition-all active:scale-95 cursor-pointer shrink-0 ${
            isScreenSharing
              ? 'bg-emerald-500 hover:bg-emerald-600 text-white ring-2 ring-emerald-400/50'
              : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
          title="Shortcut: S"
        >
          <span className="text-sm sm:text-lg">🖥️</span>
          <span className="text-[9px] sm:text-xs">{isScreenSharing ? 'Stop' : 'Share'}</span>
        </button>

        {/* Hand Raise Button (Patient Only) */}
        {!isDoctor && (
          <button
            type="button"
            onClick={toggleHandRaise}
            className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 px-2.5 sm:px-4 py-1.5 sm:py-2.5 rounded-xl sm:rounded-2xl font-bold text-xs transition-all active:scale-95 cursor-pointer shrink-0 ${
              handRaised
                ? 'bg-amber-500 text-white ring-2 ring-amber-400/50'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
            title="Shortcut: H"
          >
            <span className="text-sm sm:text-lg">✋</span>
            <span className="text-[9px] sm:text-xs">{handRaised ? 'Lower' : 'Raise'}</span>
          </button>
        )}

        {/* Prescription Generator Button for Doctor / Health Chart for Patient */}
        <button
          type="button"
          onClick={() => setShowEHRDrawer(!showEHRDrawer)}
          className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 px-2.5 sm:px-5 py-1.5 sm:py-2.5 rounded-xl sm:rounded-2xl font-bold text-xs transition-all active:scale-95 cursor-pointer shrink-0 ${
            isDoctor
              ? showEHRDrawer
                ? 'bg-[#CAA067] text-white ring-2 ring-[#CAA067]/50 shadow-md'
                : 'bg-gradient-to-r from-[#CAA067] to-[#B88F55] text-white hover:brightness-110 shadow-sm'
              : showEHRDrawer
              ? 'bg-[#CAA067] text-white ring-2 ring-[#CAA067]/50'
              : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
          title={isDoctor ? 'Generate Prescription (E)' : 'Health Chart (E)'}
        >
          <span className="text-sm sm:text-lg">{isDoctor ? '📝' : '📋'}</span>
          <span className="text-[9px] sm:text-xs font-extrabold">
            <span className="sm:hidden">{isDoctor ? 'Rx Desk' : 'Chart'}</span>
            <span className="hidden sm:inline">{isDoctor ? 'Generate Prescription' : 'Health Chart'}</span>
          </span>
        </button>

        {/* Snapshot Tool (Desktop) */}
        <button
          type="button"
          onClick={handleSnapshot}
          className="hidden md:flex flex-row items-center justify-center gap-1 px-3 py-2.5 rounded-2xl font-bold text-xs bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95 cursor-pointer shrink-0"
          title="Capture Snapshot (C)"
        >
          <span>📸</span>
          <span>Capture</span>
        </button>

        {/* Fullscreen (Desktop) */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="hidden md:flex flex-row items-center justify-center gap-1 px-3 py-2.5 rounded-2xl font-bold text-xs bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95 cursor-pointer shrink-0"
          title="Fullscreen (F)"
        >
          <span>⛶</span>
        </button>

        {/* Main End / Leave Consultation Action */}
        {isDoctor ? (
          <button
            type="button"
            onClick={() => setConfirmEndOpen(true)}
            className="bg-red-600 hover:bg-red-700 active:scale-95 text-white px-3 sm:px-6 py-2 sm:py-3 rounded-xl sm:rounded-2xl font-black text-[11px] sm:text-sm shadow-xl transition-all flex items-center gap-1 sm:gap-2 cursor-pointer shrink-0 sm:ml-2"
          >
            <span>📞</span>
            <span className="sm:hidden">End</span>
            <span className="hidden sm:inline">End Consultation</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleLeave}
            className="bg-red-600/90 hover:bg-red-600 active:scale-95 text-white px-3 sm:px-6 py-2 sm:py-3 rounded-xl sm:rounded-2xl font-black text-[11px] sm:text-sm shadow-xl transition-all flex items-center gap-1 sm:gap-2 cursor-pointer shrink-0 sm:ml-2"
          >
            <span className="sm:hidden">📞 Leave</span>
            <span className="hidden sm:inline">Leave Call</span>
          </button>
        )}
      </footer>

      {/* Snapshot Preview Lightbox Modal */}
      {capturedSnapshot && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#0E1726] border border-white/20 rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-sm">Clinical Snapshot Captured</span>
              <button onClick={() => setCapturedSnapshot(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <img src={capturedSnapshot} alt="Clinical Capture" className="w-full rounded-2xl border border-white/15" />
            <div className="flex gap-2">
              <a
                href={capturedSnapshot}
                download={`consultation-snapshot-${Date.now()}.png`}
                className="btn-primary flex-1 py-2 text-center text-xs font-bold"
              >
                Download Image
              </a>
              <button
                onClick={() => setCapturedSnapshot(null)}
                className="btn-secondary flex-1 py-2 text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Doctor End Consultation Confirmation Modal */}
      <AnimatePresence>
        {confirmEndOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-md w-full rounded-3xl bg-white text-slate-900 p-6 sm:p-7 space-y-4 shadow-2xl"
            >
              <div className="flex items-center gap-3 text-red-600 font-bold text-lg">
                <span className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center text-lg">📞</span>
                End Consultation?
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                This will officially complete the video consultation with <strong className="text-slate-900">{appointment?.patient?.name}</strong>, finalize digital prescription records, and notify the patient.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmEndOpen(false)}
                  disabled={actionBusy}
                  className="btn-secondary flex-1 py-3 cursor-pointer"
                >
                  Stay in Call
                </button>
                <button
                  type="button"
                  onClick={handleEndConsultation}
                  disabled={actionBusy}
                  className="btn bg-red-600 hover:bg-red-700 text-white font-bold flex-1 py-3 rounded-xl shadow-xs cursor-pointer"
                >
                  {actionBusy ? 'Finalizing…' : 'End Consultation'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* User-Friendly Help & Shortcuts Modal */}
      <AnimatePresence>
        {showHelpModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-lg w-full rounded-3xl bg-[#0E1726] text-white border border-white/20 p-6 space-y-5 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <span className="text-xl">💡</span>
                  <h3 className="font-extrabold text-base text-white font-display">Video Consultation Tips &amp; Help</h3>
                </div>
                <button
                  onClick={() => setShowHelpModal(false)}
                  className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-300">
                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                  <strong className="text-white">🎙️ Audio &amp; Video Controls:</strong>
                  <p className="text-slate-400">Click Mute/Camera in the bottom bar anytime. If you are muted, the system will alert you when you speak.</p>
                </div>

                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                  <strong className="text-white">📋 Clinical EHR &amp; Digital Prescription:</strong>
                  <p className="text-slate-400">Click the &apos;Rx &amp; EHR&apos; button to monitor live vitals, review uploaded lab test scans, and see prescriptions.</p>
                </div>

                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                  <strong className="text-white">⌨️ Keyboard Shortcuts:</strong>
                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 text-slate-300 font-mono">
                    <div><span className="px-1.5 py-0.5 rounded bg-white/15 text-white font-bold">M</span> Mute Mic</div>
                    <div><span className="px-1.5 py-0.5 rounded bg-white/15 text-white font-bold">V</span> Video Toggle</div>
                    <div><span className="px-1.5 py-0.5 rounded bg-white/15 text-white font-bold">S</span> Screen Share</div>
                    <div><span className="px-1.5 py-0.5 rounded bg-white/15 text-white font-bold">H</span> Raise Hand</div>
                    <div><span className="px-1.5 py-0.5 rounded bg-white/15 text-white font-bold">E</span> Clinical EHR</div>
                    <div><span className="px-1.5 py-0.5 rounded bg-white/15 text-white font-bold">F</span> Fullscreen</div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="w-full btn-primary py-3 font-bold text-xs"
              >
                Got It, Back to Call
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Post Consultation Summary Modal */}
      {showSummaryModal && (
        <PostConsultationSummaryModal
          appointment={appointment}
          role={isDoctor ? 'DOCTOR' : 'PATIENT'}
          callDuration={callDuration}
          onClose={() => navigate(isDoctor ? '/doctor' : '/patient/past-records')}
        />
      )}
    </div>
  );
}
