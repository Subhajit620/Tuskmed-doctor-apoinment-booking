import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { apiErrorMessage } from '../../api/client';

export default function VideoCall() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('checking'); // checking | waiting | ready | error
  const [videoLink, setVideoLink] = useState(null);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const isMockLink = videoLink && videoLink.includes('mock=');

  useEffect(() => {
    api
      .get(`/appointments/${id}/join`)
      .then((res) => {
        if (res.data.ready) {
          setVideoLink(res.data.videoLink);
          setStatus('ready');
        } else {
          setStatus('waiting');
        }
      })
      .catch((err) => {
        setError(apiErrorMessage(err));
        setStatus('error');
      });
  }, [id]);

  // In sandbox mode (no real Daily/Twilio/Agora room), fall back to a local
  // camera/mic preview so mute/video/end-call controls are demonstrably real.
  useEffect(() => {
    if (status !== 'ready' || !isMockLink) return undefined;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        /* camera/mic not available in this environment - controls still render */
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [status, isMockLink]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
  };

  const toggleVideo = () => {
    const next = !videoOff;
    setVideoOff(next);
    streamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !next; });
  };

  const endCall = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    navigate('/patient/appointments');
  };

  if (status === 'checking') return <p className="text-slate-400">Preparing your call...</p>;
  if (status === 'error') return <p className="text-red-600">{error}</p>;
  if (status === 'waiting') {
    return (
      <div className="card max-w-md mx-auto text-center py-10 space-y-2">
        <div className="text-3xl">⏳</div>
        <h2 className="font-semibold">Not time yet</h2>
        <p className="text-sm text-slate-500">Join Call opens 10 minutes before your scheduled time.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="bg-black rounded-xl aspect-video flex items-center justify-center overflow-hidden">
        {isMockLink ? (
          <video ref={videoRef} autoPlay muted playsInline className={`w-full h-full object-cover ${videoOff ? 'hidden' : ''}`} />
        ) : (
          <iframe title="Video consultation" src={videoLink} className="w-full h-full" allow="camera; microphone; fullscreen; display-capture" />
        )}
        {isMockLink && videoOff && <div className="text-white text-sm">Video is off</div>}
      </div>
      <div className="flex justify-center gap-4">
        <button className={`btn-secondary ${muted ? 'bg-slate-200' : ''}`} onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
        <button className={`btn-secondary ${videoOff ? 'bg-slate-200' : ''}`} onClick={toggleVideo}>{videoOff ? 'Start Video' : 'Stop Video'}</button>
        <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={endCall}>End Call</button>
      </div>
      {isMockLink && (
        <p className="text-xs text-center text-slate-400">
          Sandbox mode: showing your local camera preview instead of a real room. In production this embeds the WebRTC provider's room directly.
        </p>
      )}
    </div>
  );
}
