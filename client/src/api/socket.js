import { io } from 'socket.io-client';

let socket = null;

/** Lazily-created shared socket for real-time slot availability updates. */
export function getSocket() {
  if (!socket) {
    socket = io('/', { withCredentials: true, autoConnect: true });
  }
  return socket;
}
