import { io } from 'socket.io-client';

let socket = null;

/** Lazily-created shared socket for real-time slot availability and consultation signaling. */
export function getSocket() {
  if (!socket) {
    socket = io('/', {
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ['websocket', 'polling'],
    });
  } else if (!socket.connected && !socket.active) {
    socket.connect();
  }
  return socket;
}
