import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../../api/socket';
import { createAudioMeter, playMessagePing } from './audioUtils';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
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
  const targetSocketIdRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const makingOfferRef = useRef(false);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const socketRef = useRef(null);

  // Flush queued ICE candidates once remoteDescription is set
  const flushPendingCandidates = async (pc) => {
    if (!pc || !pc.remoteDescription) return;
    const queue = pendingCandidatesRef.current.splice(0, pendingCandidatesRef.current.length);
    for (const candidate of queue) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // ignore stale candidate
      }
    }
  };

  // Helper to create RTCPeerConnection
  const createPeerConnection = useCallback(
    (targetSocketId, isCaller) => {
      if (pcRef.current && targetSocketIdRef.current === targetSocketId && pcRef.current.connectionState !== 'closed' && pcRef.current.connectionState !== 'failed') {
        if (isCaller && pcRef.current.signalingState === 'stable') {
          makingOfferRef.current = true;
          pcRef.current
            .createOffer()
            .then((offer) => pcRef.current.setLocalDescription(offer))
            .then(() => {
              socketRef.current?.emit('consultation:signal', {
                to: targetSocketId,
                signal: { sdp: pcRef.current.localDescription },
                appointmentId,
              });
            })
            .catch(() => {})
            .finally(() => {
              makingOfferRef.current = false;
            });
        }
        return pcRef.current;
      }

      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {
          // ignore
        }
      }

      pendingCandidatesRef.current = [];
      targetSocketIdRef.current = targetSocketId;

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
        } else if (event.track) {
          setRemoteStream((prev) => {
            const ms = prev ? new MediaStream(prev.getTracks()) : new MediaStream();
            ms.addTrack(event.track);
            return ms;
          });
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('consultation:signal', {
            to: targetSocketIdRef.current || targetSocketId,
            signal: { candidate: event.candidate },
            appointmentId,
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed' && isCaller) {
          pc.createOffer({ iceRestart: true })
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => {
              socketRef.current?.emit('consultation:signal', {
                to: targetSocketIdRef.current || targetSocketId,
                signal: { sdp: pc.localDescription },
                appointmentId,
              });
            })
            .catch(() => {});
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
        makingOfferRef.current = true;
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            socketRef.current?.emit('consultation:signal', {
              to: targetSocketId,
              signal: { sdp: pc.localDescription },
              appointmentId,
            });
          })
          .catch(() => {})
          .finally(() => {
            makingOfferRef.current = false;
          });
      }

      return pc;
    },
    [appointmentId]
  );

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

      // Remove any duplicate listeners before re-attaching
      socket.off('connect');
      socket.off('consultation:room_peers');
      socket.off('consultation:peer_joined');
      socket.off('consultation:signal');
      socket.off('consultation:peer_state');
      socket.off('consultation:message');
      socket.off('consultation:prescription');
      socket.off('consultation:ended');
      socket.off('consultation:peer_left');

      const emitJoin = () => {
        socket.emit('consultation:join', {
          appointmentId,
          role: user.role,
          name: user.name,
        });
      };

      // Handle room peers (we just joined and found existing peers in room)
      socket.on('consultation:room_peers', ({ peers }) => {
        if (peers && peers.length > 0) {
          // Prefer opposite role (DOCTOR <-> PATIENT) so we never pair with our own duplicate tab
          const oppositePeer = peers.find((p) => p.role && p.role !== user.role);
          const peer = oppositePeer || peers[0];
          setRemotePeer(peer);
          // Initiate WebRTC offer as caller
          createPeerConnection(peer.socketId, true);
        }
      });

      // Handle peer joined (another peer joined after us)
      socket.on('consultation:peer_joined', (peer) => {
        if (!peer) return;
        // If we already have an active connection to the opposite role, ignore same-role duplicate tabs
        if (peer.role && peer.role === user.role && remotePeer && remotePeer.role !== user.role) {
          return;
        }
        setRemotePeer(peer);
        createPeerConnection(peer.socketId, false);
      });

      // Handle WebRTC signal (SDP Offer/Answer + queued ICE Candidates + Polite Glare handling)
      socket.on('consultation:signal', async ({ from, signal, senderInfo }) => {
        if (!signal) return;
        if (senderInfo && !remotePeer) {
          setRemotePeer(senderInfo);
        }

        let pc = pcRef.current;
        if (!pc || (targetSocketIdRef.current && targetSocketIdRef.current !== from && signal.sdp?.type === 'offer')) {
          pc = createPeerConnection(from, false);
        }

        try {
          if (signal.sdp) {
            const description = new RTCSessionDescription(signal.sdp);
            const isPolite = user.role !== 'DOCTOR'; // Patient is polite peer on simultaneous offer glare
            const offerCollision =
              description.type === 'offer' && (makingOfferRef.current || pc.signalingState !== 'stable');

            if (offerCollision) {
              if (!isPolite) {
                return; // Doctor ignores colliding offer; Patient will accept Doctor's offer
              }
              await pc.setLocalDescription({ type: 'rollback' }).catch(() => {});
            }

            await pc.setRemoteDescription(description);
            await flushPendingCandidates(pc);

            if (description.type === 'offer') {
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              socket.emit('consultation:signal', {
                to: from,
                signal: { sdp: pc.localDescription },
                appointmentId,
              });
            }
          } else if (signal.candidate) {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
            } else {
              // Queue ICE candidate until remoteDescription is set!
              pendingCandidatesRef.current.push(signal.candidate);
            }
          }
        } catch {
          // ignore transient signaling error
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
      socket.on('consultation:peer_left', ({ socketId }) => {
        if (!targetSocketIdRef.current || targetSocketIdRef.current === socketId) {
          setRemotePeer(null);
          setRemoteStream(null);
          targetSocketIdRef.current = null;
        }
      });

      // Emit join immediately and also re-emit on socket reconnect
      socket.on('connect', emitJoin);
      if (socket.connected) {
        emitJoin();
      } else {
        socket.connect();
      }

      setConnectionStatus('connected');
    },
    [appointmentId, user, remotePeer, createPeerConnection, onConsultationEnded, onPrescriptionIssued]
  );

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
