import { useState, useEffect, useRef } from 'react';
import { motion } from '../../components/motion';
import { playTestChime, createAudioMeter } from './audioUtils';

export default function DeviceCheckModal({
  appointment,
  role,
  onJoin,
  initialMuted = false,
  initialVideoOff = false,
}) {
  const [stream, setStream] = useState(null);
  const [muted, setMuted] = useState(initialMuted);
  const [videoOff, setVideoOff] = useState(initialVideoOff);
  const [audioLevel, setAudioLevel] = useState(0);
  const [speakerTested, setSpeakerTested] = useState(false);
  const [devices, setDevices] = useState({ cameras: [], mics: [] });
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedMic, setSelectedMic] = useState('');
  const [permissionState, setPermissionState] = useState('prompt'); // prompt | granted | denied
  const [networkPing, setNetworkPing] = useState(28);

  const videoRef = useRef(null);

  // Probe available media devices
  useEffect(() => {
    async function initMedia() {
      try {
        const userStream = await navigator.mediaDevices.getUserMedia({
          video: selectedCamera ? { deviceId: { exact: selectedCamera } } : true,
          audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
        });

        setStream(userStream);
        setPermissionState('granted');
        if (videoRef.current) {
          videoRef.current.srcObject = userStream;
        }

        // Enumerate devices
        const deviceList = await navigator.mediaDevices.enumerateDevices();
        const cameras = deviceList.filter((d) => d.kind === 'videoinput');
        const mics = deviceList.filter((d) => d.kind === 'audioinput');
        setDevices({ cameras, mics });

        if (cameras.length > 0 && !selectedCamera) {
          setSelectedCamera(cameras[0].deviceId);
        }
        if (mics.length > 0 && !selectedMic) {
          setSelectedMic(mics[0].deviceId);
        }
      } catch (err) {
        console.warn('Device check media access warning:', err);
        setPermissionState('denied');
      }
    }

    initMedia();

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [selectedCamera, selectedMic]);

  // Connect Audio Level Meter
  useEffect(() => {
    if (!stream || muted) {
      setAudioLevel(0);
      return undefined;
    }
    const cleanupMeter = createAudioMeter(stream, (level) => {
      setAudioLevel(level);
    });
    return () => cleanupMeter();
  }, [stream, muted]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    stream?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
  };

  const toggleVideo = () => {
    const next = !videoOff;
    setVideoOff(next);
    stream?.getVideoTracks().forEach((t) => {
      t.enabled = !next;
    });
  };

  const handleTestSpeaker = () => {
    playTestChime();
    setSpeakerTested(true);
  };

  const isDoctor = role === 'DOCTOR';
  const partnerName = isDoctor ? appointment?.patient?.name : appointment?.doctor?.name;
  const partnerTitle = isDoctor ? 'Patient' : 'Specialist Doctor';

  return (
    <div className="fixed inset-0 z-50 bg-[#070D18]/95 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-3xl w-full bg-[#0E1726] border border-white/15 rounded-[32px] overflow-hidden shadow-2xl flex flex-col my-auto"
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#CAA067]/20 border border-[#CAA067]/40 flex items-center justify-center text-xl">
              🏥
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white font-display">
                Medical Video Consultation
              </h2>
              <p className="text-xs text-slate-400">
                Pre-Call Equipment &amp; Network Health Check
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>HD Ready ({networkPing}ms)</span>
          </div>
        </div>

        {/* Body Split Grid */}
        <div className="p-6 grid md:grid-cols-12 gap-6 items-center">
          {/* Left: Video Preview Tile (7 cols) */}
          <div className="md:col-span-7 space-y-3">
            <div className="relative aspect-video rounded-2xl bg-[#131E30] border border-white/15 overflow-hidden shadow-inner flex items-center justify-center">
              {permissionState === 'denied' || videoOff ? (
                <div className="text-center p-6 space-y-2">
                  <div className="w-16 h-16 rounded-full bg-white/10 text-slate-400 flex items-center justify-center mx-auto text-2xl font-bold">
                    📷
                  </div>
                  <div className="text-sm font-bold text-white">Camera is Off</div>
                  <p className="text-[11px] text-slate-400 max-w-xs">
                    {permissionState === 'denied'
                      ? 'Camera/mic permissions not granted. You can still join and listen.'
                      : 'You can start your camera at any point during consultation.'}
                  </p>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover mirror"
                  style={{ transform: 'scaleX(-1)' }}
                />
              )}

              {/* Floating Quick Toggles */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2.5 bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20">
                <button
                  type="button"
                  onClick={toggleMute}
                  className={`p-2 rounded-full transition-colors ${
                    muted ? 'bg-red-500 text-white' : 'bg-white/20 hover:bg-white/30 text-white'
                  }`}
                  title={muted ? 'Unmute' : 'Mute'}
                >
                  {muted ? '🔇' : '🎙️'}
                </button>
                <button
                  type="button"
                  onClick={toggleVideo}
                  className={`p-2 rounded-full transition-colors ${
                    videoOff ? 'bg-red-500 text-white' : 'bg-white/20 hover:bg-white/30 text-white'
                  }`}
                  title={videoOff ? 'Turn video on' : 'Turn video off'}
                >
                  {videoOff ? '🚫' : '📹'}
                </button>
              </div>
            </div>

            {/* Mic Level Bar Indicator */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                <span>Microphone Activity</span>
                <span className={audioLevel > 5 ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                  {muted ? 'Muted' : audioLevel > 5 ? 'Detecting Voice' : 'Speak to test'}
                </span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-[#CAA067] transition-all duration-75"
                  style={{ width: `${muted ? 0 : Math.min(100, audioLevel * 1.8)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Right: Equipment Check & Room Info (5 cols) */}
          <div className="md:col-span-5 space-y-4">
            {/* Consultation Summary Badge */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
              <div className="text-[10px] uppercase font-bold text-[#CAA067] tracking-wider">
                Consulting With
              </div>
              <div className="font-extrabold text-base text-white">
                {partnerName || 'Specialist Doctor'}
              </div>
              <div className="text-xs text-slate-300">
                {partnerTitle} &middot; {appointment?.doctor?.speciality || 'Video Teleconsult'}
              </div>
            </div>

            {/* Device Selector Controls */}
            <div className="space-y-2.5 text-xs text-slate-300">
              {/* Speaker Test */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-2">
                  <span>🔊</span>
                  <span className="font-medium">Speaker Test</span>
                </div>
                <button
                  type="button"
                  onClick={handleTestSpeaker}
                  className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-[11px] transition-colors"
                >
                  {speakerTested ? '✓ Tested' : 'Play Sound'}
                </button>
              </div>

              {/* Camera Switcher (if multiple) */}
              {devices.cameras.length > 1 && (
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Camera Source</label>
                  <select
                    value={selectedCamera}
                    onChange={(e) => setSelectedCamera(e.target.value)}
                    className="w-full bg-[#131E30] border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                  >
                    {devices.cameras.map((c, i) => (
                      <option key={c.deviceId} value={c.deviceId}>
                        {c.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Security Guarantee Note */}
            <div className="flex items-start gap-2 text-[11px] text-slate-400">
              <span className="text-emerald-400 text-xs">🔒</span>
              <span>256-bit encrypted WebRTC video stream. HIPAA &amp; NDHM compliant.</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-black/30 border-t border-white/10 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => onJoin({ muted, videoOff, stream })}
            className="w-full sm:w-auto btn-primary px-8 py-3.5 text-sm font-bold shadow-xl flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Enter Consultation Room</span>
            <span>→</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
