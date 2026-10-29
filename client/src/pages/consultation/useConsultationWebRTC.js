import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../../api/socket';
import { createAudioMeter, playMessagePing } from './audioUtils';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function useConsultationWebRTC({ appointmentId, user, onConsultationEnded, onPrescriptionIssued }) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);

  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);

  const [remotePeer, setRemotePeer] = useState(null);
  const [remoteState, setRemoteState] = useState({ muted: false, videoOff: false, handRaised: false });
  const [localVolume, setLocalVolume] = useState(0);
  const [remoteVolume, setRemoteVolume] = useState(0);

  const [connectionStatus, setConnectionStatus] = useState('connecting'); // connecting | connected | disconnected | ended
  const [inCallMessages, setInCallMessages] = useState([]);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const socketRef = useRef(null);

  // Initialize media and socket connection
  const initCall = useCallback(
    async (initialMedia = {}) => {
      let stream = initialMedia.stream;
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
        } catch {
          // Camera/mic not accessible or denied
          stream = null;
        }
      }

      if (stream) {
        if (initialMedia.muted) {
          stream.getAudioTracks().forEach((t) => { t.enabled = false; });
          setMuted(true);
        }
        if (initialMedia.videoOff) {
          stream.getVideoTracks().forEach((t) => { t.enabled = false; });
          setVideoOff(true);
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
      }

      const socket = getSocket();
      socketRef.current = socket;

      // Join consultation room
      socket.emit('consultation:join', {
        appointmentId,
        role: user.role,
        name: user.name,
      });

      // Handle room peers
      socket.on('consultation:room_peers', ({ peers }) => {
        if (peers && peers.length > 0) {
          const peer = peers[0];
          setRemotePeer(peer);
          // Initiate WebRTC offer as caller
          createPeerConnection(peer.socketId, true);
        }
      });

      // Handle peer joined
      socket.on('consultation:peer_joined', (peer) => {
        setRemotePeer(peer);
        createPeerConnection(peer.socketId, false);
      });

      // Handle WebRTC signal
      socket.on('consultation:signal', async ({ from, signal }) => {
        let pc = pcRef.current;
        if (!pc) {
          pc = createPeerConnection(from, false);
        }

        if (signal.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          if (signal.sdp.type === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('consultation:signal', {
              to: from,
              signal: { sdp: answer },
              appointmentId,
            });
          }
        } else if (signal.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch {
            // ignore ICE errors
          }
        }
      });

      // Handle remote state updates
      socket.on('consultation:peer_state', ({ state }) => {
        setRemoteState((prev) => ({ ...prev, ...state }));
      });

      // Handle in-call chat broadcast
      socket.on('consultation:message', ({ message }) => {
        playMessagePing();
        setInCallMessages((prev) => [...prev, message]);
      });

      // Handle real-time prescription issued
      socket.on('consultation:prescription', ({ prescription }) => {
        onPrescriptionIssued?.(prescription);
      });

      // Handle consultation ended
      socket.on('consultation:ended', () => {
        setConnectionStatus('ended');
        onConsultationEnded?.();
      });

      // Handle peer left
      socket.on('consultation:peer_left', () => {
        setRemotePeer(null);
        setRemoteStream(null);
      });

      setConnectionStatus('connected');
    },
    [appointmentId, user, onConsultationEnded, onPrescriptionIssued]
  );

  // Helper to create RTCPeerConnection
  const createPeerConnection = (targetSocketId, isCaller) => {
    if (pcRef.current) {
      pcRef.current.close();
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    // Add local tracks to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('consultation:signal', {
          to: targetSocketId,
          signal: { candidate: event.candidate },
          appointmentId,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setConnectionStatus('connected');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setConnectionStatus('disconnected');
      }
    };

    if (isCaller) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          socketRef.current?.emit('consultation:signal', {
            to: targetSocketId,
            signal: { sdp: pc.localDescription },
            appointmentId,
          });
        })
        .catch(() => {});
    }

    return pc;
  };

  // Local Voice Volume Meter
  useEffect(() => {
    if (!localStream || muted) {
      setLocalVolume(0);
      return undefined;
    }
    const cleanup = createAudioMeter(localStream, setLocalVolume);
    return () => cleanup();
  }, [localStream, muted]);

  // Remote Voice Volume Meter
  useEffect(() => {
    if (!remoteStream || remoteState.muted) {
      setRemoteVolume(0);
      return undefined;
    }
    const cleanup = createAudioMeter(remoteStream, setRemoteVolume);
    return () => cleanup();
  }, [remoteStream, remoteState.muted]);

  // Controls
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    socketRef.current?.emit('consultation:state', {
      appointmentId,
      state: { muted: next },
    });
  };

  const toggleVideo = () => {
    const next = !videoOff;
    setVideoOff(next);
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !next;
    });
    socketRef.current?.emit('consultation:state', {
      appointmentId,
      state: { videoOff: next },
    });
  };

  const toggleHandRaise = () => {
    const next = !handRaised;
    setHandRaised(next);
    socketRef.current?.emit('consultation:state', {
      appointmentId,
      state: { handRaised: next },
    });
  };

  const startScreenShare = async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false,
      });

      screenStreamRef.current = displayStream;
      setScreenStream(displayStream);
      setIsScreenSharing(true);

      const screenTrack = displayStream.getVideoTracks()[0];
      if (pcRef.current) {
        const senders = pcRef.current.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(screenTrack);
        }
      }

      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch {
      // User cancelled screen share picker
    }
  };

  const stopScreenShare = () => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    setScreenStream(null);
    setIsScreenSharing(false);

    // Revert track to local camera
    if (pcRef.current && localStreamRef.current) {
      const cameraTrack = localStreamRef.current.getVideoTracks()[0];
      const senders = pcRef.current.getSenders();
      const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
      if (videoSender && cameraTrack) {
        videoSender.replaceTrack(cameraTrack);
      }
    }
  };

  const captureSnapshot = (videoElement) => {
    if (!videoElement) return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth || 1280;
      canvas.height = videoElement.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  };

  // Broadcast in-call message
  const sendInCallMessage = (msg) => {
    setInCallMessages((prev) => [...prev, msg]);
    socketRef.current?.emit('consultation:message', {
      appointmentId,
      message: msg,
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (pcRef.current) pcRef.current.close();
      if (socketRef.current) {
        socketRef.current.emit('consultation:leave', { appointmentId });
        socketRef.current.off('consultation:room_peers');
        socketRef.current.off('consultation:peer_joined');
        socketRef.current.off('consultation:signal');
        socketRef.current.off('consultation:peer_state');
        socketRef.current.off('consultation:message');
        socketRef.current.off('consultation:ended');
        socketRef.current.off('consultation:peer_left');
      }
    };
  }, [appointmentId]);

  return {
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
  };
}
