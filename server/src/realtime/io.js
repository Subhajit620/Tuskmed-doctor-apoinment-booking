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
      if (token) {
        const payload = jwt.verify(token, env.jwtSecret);
        const account = await prisma.account.findUnique({ where: { id: payload.sub } });
        if (account) {
          socket.account = account;
        }
      }
    } catch {
      // Allow guest/direct-link consultation sockets even if session cookie is missing or expired
    }
    next();
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
    socket.on('consultation:join', async ({ appointmentId, role, name }) => {
      if (!appointmentId) return;

      // Leave previous consultation rooms if switching between multiple appointments
      if (socket.consultationRooms && Array.isArray(socket.consultationRooms)) {
        for (const oldRoom of socket.consultationRooms) {
          socket.leave(oldRoom);
          socket.to(oldRoom).emit('consultation:peer_left', {
            socketId: socket.id,
            senderInfo: socket.consultationInfo,
          });
        }
      }

      const roomKey = `consultation:${appointmentId}`;
      const roomsToJoin = [roomKey];

      // Also bridge by (doctorId, patientId) pair so if a patient has created multiple
      // appointments with the same doctor and they click different appointment links,
      // they still discover each other and connect seamlessly.
      try {
        const appt = await prisma.appointment.findUnique({
          where: { id: String(appointmentId) },
          select: { id: true, doctorId: true, patientId: true },
        });
        if (appt?.doctorId && appt?.patientId) {
          roomsToJoin.push(`consultation_pair:${appt.doctorId}:${appt.patientId}`);
        }
      } catch {
        // Fallback to appointment roomKey only
      }

      for (const r of roomsToJoin) {
        socket.join(r);
      }

      const effectiveRole = role || socket.account?.role || 'PATIENT';
      const accountId = socket.account?.id || `guest_${socket.id}`;
      socket.consultationRoom = roomKey;
      socket.consultationRooms = roomsToJoin;
      socket.consultationInfo = {
        role: effectiveRole,
        name: name || (effectiveRole === 'DOCTOR' ? 'Doctor' : 'Patient'),
        socketId: socket.id,
        accountId,
        appointmentId,
      };

      // Gather all unique existing peers across both the appointment room and the doctor-patient pair room
      const peerMap = new Map();
      for (const r of roomsToJoin) {
        const roomSet = ioInstance.sockets.adapter.rooms.get(r);
        if (!roomSet) continue;
        for (const peerSocketId of roomSet) {
          if (peerSocketId === socket.id) continue;
          const peerSocket = ioInstance.sockets.sockets.get(peerSocketId);
          if (peerSocket?.consultationInfo) {
            peerMap.set(peerSocketId, peerSocket.consultationInfo);
          }
        }
      }

      // Notify all discovered peers that this user joined
      for (const peerSocketId of peerMap.keys()) {
        ioInstance.to(peerSocketId).emit('consultation:peer_joined', socket.consultationInfo);
      }

      // Sort peers so opposite role (DOCTOR <-> PATIENT) is always first
      const existingPeers = Array.from(peerMap.values()).sort((a, b) => {
        const aOpposite = a.role !== effectiveRole ? 0 : 1;
        const bOpposite = b.role !== effectiveRole ? 0 : 1;
        return aOpposite - bOpposite;
      });

      socket.emit('consultation:room_peers', { peers: existingPeers });
    });

    socket.on('consultation:signal', ({ to, signal, appointmentId }) => {
      if (to) {
        ioInstance.to(to).emit('consultation:signal', {
          from: socket.id,
          signal,
          senderInfo: socket.consultationInfo,
        });
      } else {
        const targetRooms = socket.consultationRooms || (appointmentId ? [`consultation:${appointmentId}`] : []);
        for (const r of targetRooms) {
          socket.to(r).emit('consultation:signal', {
            from: socket.id,
            signal,
            senderInfo: socket.consultationInfo,
          });
        }
      }
    });

    socket.on('consultation:state', ({ appointmentId, state }) => {
      const targetRooms = socket.consultationRooms || (appointmentId ? [`consultation:${appointmentId}`] : []);
      for (const r of targetRooms) {
        socket.to(r).emit('consultation:peer_state', {
          from: socket.id,
          state,
          senderInfo: socket.consultationInfo,
        });
      }
    });

    socket.on('consultation:message', ({ appointmentId, message }) => {
      if (!message) return;
      const targetRooms = socket.consultationRooms || (appointmentId ? [`consultation:${appointmentId}`] : []);
      for (const r of targetRooms) {
        socket.to(r).emit('consultation:message', {
          message,
          from: socket.id,
          senderInfo: socket.consultationInfo,
        });
      }
    });

    socket.on('consultation:vitals_sync', ({ appointmentId, vitals }) => {
      if (!vitals) return;
      const targetRooms = socket.consultationRooms || (appointmentId ? [`consultation:${appointmentId}`] : []);
      for (const r of targetRooms) {
        socket.to(r).emit('consultation:vitals_update', {
          vitals,
          updatedAt: new Date().toISOString(),
        });
      }
    });

    socket.on('consultation:leave', ({ appointmentId }) => {
      const targetRooms = socket.consultationRooms || (appointmentId ? [`consultation:${appointmentId}`] : []);
      for (const r of targetRooms) {
        socket.leave(r);
        socket.to(r).emit('consultation:peer_left', {
          socketId: socket.id,
          senderInfo: socket.consultationInfo,
        });
      }
      delete socket.consultationRoom;
      delete socket.consultationRooms;
      delete socket.consultationInfo;
    });

    socket.on('disconnect', () => {
      const targetRooms = socket.consultationRooms || (socket.consultationRoom ? [socket.consultationRoom] : []);
      for (const r of targetRooms) {
        socket.to(r).emit('consultation:peer_left', {
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

async function broadcastConsultationEvent(appointmentId, event, payload) {
  if (!ioInstance || !appointmentId) return;
  ioInstance.to(`consultation:${appointmentId}`).emit(event, payload);
  try {
    const appt = await prisma.appointment.findUnique({
      where: { id: String(appointmentId) },
      select: { doctorId: true, patientId: true },
    });
    if (appt?.doctorId && appt?.patientId) {
      ioInstance.to(`consultation_pair:${appt.doctorId}:${appt.patientId}`).emit(event, payload);
    }
  } catch {
    // ignore lookup error
  }
}

module.exports = { initIo, broadcastSlotChange, broadcastConsultationEvent };
