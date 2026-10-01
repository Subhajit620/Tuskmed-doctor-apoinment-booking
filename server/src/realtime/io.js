const jwt = require('jsonwebtoken');
const env = require('../config/env');
const prisma = require('../db/prisma');

let ioInstance = null;

/** Manual cookie-header parse - avoids pulling in a dependency for one lookup. */
function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

/**
 * Real-time slot availability. Clients join a room per doctor+date
 * ("doctor:<id>:<yyyy-mm-dd>") while viewing that doctor's slot picker;
 * the server broadcasts to that room whenever a slot is locked, released,
 * or booked, so competing patients see availability change immediately
 * without polling.
 *
 * Every REST endpoint that exposes this same data (GET /api/doctors/:id/slots)
 * requires a valid session - the socket handshake is held to the same bar,
 * using the identical session cookie, so this channel is never an
 * unauthenticated side door into scheduling activity.
 */
function initIo(server, corsOrigin) {
  // eslint-disable-next-line global-require
  const { Server } = require('socket.io');
  ioInstance = new Server(server, { cors: { origin: corsOrigin, credentials: true } });

  ioInstance.use(async (socket, next) => {
    try {
      const token = readCookie(socket.handshake.headers.cookie, env.sessionCookieName);
      if (!token) throw new Error('No session');
      const payload = jwt.verify(token, env.jwtSecret);
      const account = await prisma.account.findUnique({ where: { id: payload.sub } });
      if (!account) throw new Error('No account');
      socket.account = account;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  ioInstance.on('connection', (socket) => {
    // ---- Slot availability subscriptions ----
    socket.on('slots:subscribe', ({ doctorId, date }) => {
      if (doctorId && date) socket.join(`doctor:${doctorId}:${date}`);
    });
    socket.on('slots:unsubscribe', ({ doctorId, date }) => {
      if (doctorId && date) socket.leave(`doctor:${doctorId}:${date}`);
    });

    // ---- Video Consultation Room & WebRTC Signaling ----
    socket.on('consultation:join', ({ appointmentId, role, name }) => {
      if (!appointmentId) return;
      const roomKey = `consultation:${appointmentId}`;
      socket.join(roomKey);
      socket.consultationRoom = roomKey;
      socket.consultationInfo = { role, name, socketId: socket.id, accountId: socket.account.id };

      // Notify others in room that a peer joined
      socket.to(roomKey).emit('consultation:peer_joined', {
        socketId: socket.id,
        role,
        name,
        accountId: socket.account.id,
      });

      // Find existing participants in this room to return to caller
      const room = ioInstance.sockets.adapter.rooms.get(roomKey);
      const existingPeers = [];
      if (room) {
        for (const peerSocketId of room) {
          if (peerSocketId !== socket.id) {
            const peerSocket = ioInstance.sockets.sockets.get(peerSocketId);
            if (peerSocket?.consultationInfo) {
              existingPeers.push(peerSocket.consultationInfo);
            }
          }
        }
      }
      socket.emit('consultation:room_peers', { peers: existingPeers });
    });

    socket.on('consultation:signal', ({ to, signal, appointmentId }) => {
      if (to) {
        ioInstance.to(to).emit('consultation:signal', {
          from: socket.id,
          signal,
          senderInfo: socket.consultationInfo,
        });
      } else if (appointmentId) {
        socket.to(`consultation:${appointmentId}`).emit('consultation:signal', {
          from: socket.id,
          signal,
          senderInfo: socket.consultationInfo,
        });
      }
    });

    socket.on('consultation:state', ({ appointmentId, state }) => {
      if (appointmentId) {
        socket.to(`consultation:${appointmentId}`).emit('consultation:peer_state', {
          from: socket.id,
          state,
          senderInfo: socket.consultationInfo,
        });
      }
    });

    socket.on('consultation:message', ({ appointmentId, message }) => {
      if (appointmentId && message) {
        socket.to(`consultation:${appointmentId}`).emit('consultation:message', {
          message,
          from: socket.id,
          senderInfo: socket.consultationInfo,
        });
      }
    });

    socket.on('consultation:vitals_sync', ({ appointmentId, vitals }) => {
      if (appointmentId && vitals) {
        socket.to(`consultation:${appointmentId}`).emit('consultation:vitals_update', {
          vitals,
          updatedAt: new Date().toISOString(),
        });
      }
    });

    socket.on('consultation:leave', ({ appointmentId }) => {
      const roomKey = `consultation:${appointmentId}`;
      socket.leave(roomKey);
      socket.to(roomKey).emit('consultation:peer_left', {
        socketId: socket.id,
        senderInfo: socket.consultationInfo,
      });
      delete socket.consultationRoom;
      delete socket.consultationInfo;
    });

    socket.on('disconnect', () => {
      if (socket.consultationRoom) {
        socket.to(socket.consultationRoom).emit('consultation:peer_left', {
          socketId: socket.id,
          senderInfo: socket.consultationInfo,
        });
      }
    });
  });

  return ioInstance;
}

function dateKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function broadcastSlotChange(doctorId, slotStart, payload) {
  if (!ioInstance) return;
  ioInstance.to(`doctor:${doctorId}:${dateKey(slotStart)}`).emit('slot:update', payload);
}

function broadcastConsultationEvent(appointmentId, event, payload) {
  if (!ioInstance) return;
  ioInstance.to(`consultation:${appointmentId}`).emit(event, payload);
}

module.exports = { initIo, broadcastSlotChange, broadcastConsultationEvent };
