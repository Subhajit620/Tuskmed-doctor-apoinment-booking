const express = require('express');
const multer = require('multer');
const prisma = require('../db/prisma');
const env = require('../config/env');
const { requireAuth, requireRole } = require('../middleware/auth');
const { requireActivePatient } = require('../middleware/activePatient');
const { evaluatePromo } = require('../utils/promo');
const { createOrder, verifyPaymentSignature, refundPayment } = require('../integrations/payment');
const { createRoom, videoService } = require('../integrations/video');
const { uploadFile } = require('../integrations/storage');
const { sendAppointmentConfirmation, sendDoctorAppointmentNotification } = require('../integrations/whatsapp');
const { broadcastSlotChange } = require('../realtime/io');
const { audit } = require('../utils/audit');
const { ApiError } = require('../utils/errors');
const { computeAge } = require('../utils/age');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.rules.maxUploadBytes } });

const DETAIL_INCLUDE = {
  doctor: { include: { speciality: true } },
  slot: true,
  patient: true,
  payment: { include: { promo: true } },
  documents: true,
  report: true,
  prescription: true,
};

async function loadOwnedAppointment(id, account) {
  const appt = await prisma.appointment.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!appt) throw new ApiError(404, 'Appointment not found', 'NOT_FOUND');
  if (account.role === 'PATIENT' && appt.patient.accountId !== account.id) {
    throw new ApiError(403, 'Not your appointment', 'FORBIDDEN');
  }
  if (account.role === 'DOCTOR' && appt.doctor.accountId !== account.id) {
    throw new ApiError(403, 'Not your appointment', 'FORBIDDEN');
  }
  return appt;
}

function serialize(appt) {
  return {
    id: appt.id,
    mode: appt.mode,
    status: appt.status,
    isFollowUp: appt.isFollowUp,
    symptoms: appt.symptoms,
    category: appt.category,
    videoLink: appt.videoLink,
    createdAt: appt.createdAt,
    patient: appt.patient && {
      id: appt.patient.id,
      name: appt.patient.name,
      age: computeAge(appt.patient.dob),
      gender: appt.patient.gender,
      mobile: appt.patient.mobile,
      city: appt.patient.city,
      state: appt.patient.state,
    },
    doctor: appt.doctor && {
      id: appt.doctor.id,
      name: appt.doctor.name,
      speciality: appt.doctor.speciality?.name,
      fee: appt.doctor.fee,
      registrationNo: appt.doctor.registrationNo,
      experienceYrs: appt.doctor.experienceYrs,
    },
    slot: appt.slot && { id: appt.slot.id, start: appt.slot.start, end: appt.slot.end },
    payment: appt.payment && {
      status: appt.payment.status,
      amount: appt.payment.amount,
      originalAmount: appt.payment.originalAmount,
      promoCode: appt.payment.promo?.code || null,
    },
    documents: appt.documents,
    report: appt.report,
    prescription: appt.prescription,
  };
}

// ---------------------------------------------------------------------
// Promo preview (Book Appointment step 3) - no side effects.
// ---------------------------------------------------------------------
router.get('/promo/preview', requireAuth, requireRole('PATIENT'), async (req, res, next) => {
  try {
    const { code, doctorId, mode } = req.query;
    const doctor = await prisma.doctor.findUnique({ where: { id: String(doctorId || '') } });
    if (!doctor) throw new ApiError(400, 'doctorId is required and must be valid', 'INVALID_DOCTOR');
    const baseFee = mode === 'IN_CLINIC' ? doctor.clinicFee : doctor.fee;
    const evaluation = await evaluatePromo(code, baseFee);
    res.json({ fee: baseFee, ...evaluation, promo: undefined });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Book Appointment (final step): locks the slot, creates the appointment
// in PENDING_PAYMENT, and opens a payment order - all atomically. This is
// the one place the "no double-booking" rule is enforced.
// ---------------------------------------------------------------------
router.post('/book', requireAuth, requireRole('PATIENT'), requireActivePatient, async (req, res, next) => {
  try {
    const { doctorId, slotId, mode, symptoms, category, promoCode } = req.body || {};
    if (!doctorId || !slotId || !mode) {
      throw new ApiError(400, 'doctorId, slotId and mode are required', 'MISSING_FIELDS');
    }
    if (!['VIDEO', 'IN_CLINIC'].includes(mode)) throw new ApiError(400, 'Invalid mode', 'INVALID_MODE');

    const slot = await prisma.slot.findUnique({ where: { id: slotId } });
    if (!slot || slot.doctorId !== doctorId) throw new ApiError(404, 'Slot not found for this doctor', 'SLOT_NOT_FOUND');
    if (slot.mode !== mode) throw new ApiError(400, 'Slot mode does not match requested mode', 'MODE_MISMATCH');
    if (new Date(slot.start).getTime() <= Date.now()) throw new ApiError(400, 'Slot is in the past', 'SLOT_PAST');

    // A doctor-blocked date/mode still shows the slot (blocking doesn't
    // delete it) but must refuse new bookings against it.
    const blocked = await prisma.blockedPeriod.findFirst({
      where: {
        doctorId,
        startDate: { lte: slot.start },
        endDate: { gte: slot.start },
        OR: [{ mode: 'BOTH' }, { mode }],
      },
    });
    if (blocked) throw new ApiError(409, 'This doctor is unavailable on the selected date. Please pick another.', 'DATE_BLOCKED');

    // Atomic conditional lock: only succeeds if the slot is still AVAILABLE.
    // This is what actually prevents two patients from racing onto the same
    // slot - the DB-level partial unique index on Appointment.slotId (see
    // the slot_partial_unique migration) is the second, belt-and-braces
    // guarantee, without permanently burning a slot after a failed attempt.
    const lockExpiresAt = new Date(Date.now() + env.rules.slotLockMinutes * 60 * 1000);
    const lockResult = await prisma.slot.updateMany({
      where: { id: slotId, status: 'AVAILABLE' },
      data: { status: 'LOCKED', lockedAt: new Date(), lockExpiresAt },
    });
    if (lockResult.count === 0) {
      throw new ApiError(409, 'This slot was just taken. Please pick another.', 'SLOT_UNAVAILABLE');
    }

    let appointment;
    try {
      const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
      const baseFee = mode === 'VIDEO' ? doctor.fee : doctor.clinicFee;
      const evaluation = await evaluatePromo(promoCode, baseFee);
      if (promoCode && evaluation.state !== 'valid') {
        throw new ApiError(400, `Promo code is ${evaluation.state}`, 'PROMO_' + evaluation.state.toUpperCase());
      }

      // A follow-up is any booking where this patient has already had at
      // least one prior (non-cancelled) appointment with this same doctor.
      const priorVisit = await prisma.appointment.findFirst({
        where: { patientId: req.activePatient.id, doctorId, status: { not: 'CANCELLED' } },
      });

      appointment = await prisma.appointment.create({
        data: {
          patientId: req.activePatient.id,
          doctorId,
          slotId,
          mode,
          symptoms: symptoms || null,
          category: category || null,
          status: 'PENDING_PAYMENT',
          isFollowUp: !!priorVisit,
        },
      });

      const amountInPaise = Math.round(evaluation.finalAmount * 100);
      const order = await createOrder({
        amountInPaise,
        receipt: appointment.id,
        notes: { appointmentId: appointment.id, patientId: req.activePatient.id },
      });

      await prisma.payment.create({
        data: {
          appointmentId: appointment.id,
          promoId: evaluation.promo?.id || null,
          originalAmount: baseFee,
          amount: evaluation.finalAmount,
          status: 'CREATED',
          gatewayOrderId: order.id,
        },
      });

      broadcastSlotChange(doctorId, slot.start, { slotId, status: 'LOCKED' });
      await audit(req.account.id, 'APPOINTMENT_BOOKING_STARTED', {
        appointmentId: appointment.id,
        slotId,
        patientId: req.activePatient.id,
      });

      res.status(201).json({
        appointmentId: appointment.id,
        slotLockExpiresAt: lockExpiresAt,
        order: { id: order.id, amount: amountInPaise, currency: 'INR', keyId: order.keyId },
        fee: doctor.fee,
        discountAmount: evaluation.discountAmount,
        amountDue: evaluation.finalAmount,
      });
    } catch (innerErr) {
      // Roll back the lock if anything after it failed, so the slot isn't
      // stranded until the sweeper gets to it.
      await prisma.slot.updateMany({
        where: { id: slotId, status: 'LOCKED' },
        data: { status: 'AVAILABLE', lockedAt: null, lockExpiresAt: null },
      });
      if (appointment) {
        await prisma.appointment.delete({ where: { id: appointment.id } }).catch(() => {});
      }
      throw innerErr;
    }
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Confirm payment (client-side checkout callback). Appointment is only
// ever CONFIRMED here, after a verified successful payment.
// ---------------------------------------------------------------------
router.post('/:id/confirm-payment', requireAuth, requireRole('PATIENT'), async (req, res, next) => {
  try {
    const { gatewayPaymentId, gatewayOrderId, signature, mockOutcome } = req.body || {};
    const appt = await loadOwnedAppointment(req.params.id, req.account);
    if (appt.status !== 'PENDING_PAYMENT') {
      return res.json({ status: appt.status, message: 'Appointment already finalized' });
    }

    const valid = verifyPaymentSignature({
      orderId: gatewayOrderId || appt.payment?.gatewayOrderId,
      paymentId: gatewayPaymentId,
      signature,
      mockOutcome: mockOutcome || 'success',
    });

    if (!valid) {
      await failAppointment(appt);
      throw new ApiError(400, 'Payment verification failed', 'PAYMENT_INVALID');
    }

    const confirmed = await confirmAppointment(appt, gatewayPaymentId);
    res.json({ appointment: serialize(confirmed) });
  } catch (err) {
    next(err);
  }
});

async function confirmAppointment(appt, gatewayPaymentId) {
  const updates = [
    prisma.payment.upsert({
      where: { appointmentId: appt.id },
      create: {
        appointmentId: appt.id,
        originalAmount: appt.doctor?.fee || 0,
        amount: appt.doctor?.fee || 0,
        status: 'SUCCESS',
        gatewayPaymentId: gatewayPaymentId || null,
      },
      update: {
        status: 'SUCCESS',
        gatewayPaymentId: gatewayPaymentId || null,
      },
    }),
  ];
  if (appt.slotId) {
    updates.push(prisma.slot.update({ where: { id: appt.slotId }, data: { status: 'BOOKED' } }));
  }
  if (appt.payment?.promoId) {
    updates.push(prisma.promoCode.update({ where: { id: appt.payment.promoId }, data: { usedCount: { increment: 1 } } }));
  }
  await prisma.$transaction(updates);

  let videoLink = appt.videoLink || null;
  let videoRoomName = appt.videoRoomName || null;
  if (appt.mode === 'VIDEO') {
    try {
      const room = await createRoom(appt.id, appt.slot?.start);
      videoLink = room?.url || `/consultation/${appt.id}`;
      videoRoomName = room?.name || `tuskmed-${appt.id.slice(0, 8)}`;
    } catch (roomErr) {
      console.warn('[Video] Could not create room, fallback to internal room:', roomErr.message);
      videoRoomName = `tuskmed-${appt.id.slice(0, 8)}`;
      videoLink = `/consultation/${appt.id}`;
    }
  }

  const finalAppt = await prisma.appointment.update({
    where: { id: appt.id },
    data: { status: 'CONFIRMED', videoLink, videoRoomName },
    include: DETAIL_INCLUDE,
  });

  try {
    // 1. Send confirmation to Patient
    const patientAccount = await prisma.account.findUnique({ where: { id: finalAppt.patient?.accountId } });
    const patientMobile = finalAppt.patient?.mobile || patientAccount?.mobile;
    if (patientMobile) {
      await sendAppointmentConfirmation(patientMobile, {
        doctorName: finalAppt.doctor?.name,
        start: finalAppt.slot?.start,
        mode: finalAppt.mode,
        patientName: finalAppt.patient?.name,
        meetingUrl: finalAppt.videoLink,
      });
    }

    // 2. Send notification to Doctor
    if (finalAppt.doctor?.accountId) {
      const doctorAccount = await prisma.account.findUnique({ where: { id: finalAppt.doctor.accountId } });
      if (doctorAccount?.mobile) {
        await sendDoctorAppointmentNotification(doctorAccount.mobile, {
          doctorName: finalAppt.doctor?.name,
          patientName: finalAppt.patient?.name,
          start: finalAppt.slot?.start,
          mode: finalAppt.mode,
          meetingUrl: finalAppt.videoLink,
        });
      }
    }
  } catch (err) {
    console.warn('[WhatsApp] Could not send appointment confirmations:', err.message);
  }

  try {
    await audit(finalAppt.patient?.accountId || null, 'APPOINTMENT_CONFIRMED', { appointmentId: finalAppt.id });
  } catch (auditErr) {
    console.warn('[Audit] Confirmation audit error:', auditErr.message);
  }

  if (finalAppt.doctorId && finalAppt.slot?.start) {
    try {
      broadcastSlotChange(finalAppt.doctorId, finalAppt.slot.start, { slotId: finalAppt.slotId, status: 'BOOKED' });
    } catch (sockErr) {
      console.warn('[Socket] broadcastSlotChange error:', sockErr.message);
    }
  }

  return finalAppt;
}

async function failAppointment(appt) {
  try {
    const updates = [
      prisma.appointment.update({ where: { id: appt.id }, data: { status: 'CANCELLED' } }),
    ];
    if (appt.payment) {
      updates.push(prisma.payment.update({ where: { appointmentId: appt.id }, data: { status: 'FAILED' } }));
    }
    if (appt.slotId) {
      updates.push(prisma.slot.update({ where: { id: appt.slotId }, data: { status: 'AVAILABLE', lockedAt: null, lockExpiresAt: null } }));
    }
    await prisma.$transaction(updates);
    if (appt.doctorId && appt.slot?.start) {
      broadcastSlotChange(appt.doctorId, appt.slot.start, { slotId: appt.slotId, status: 'AVAILABLE' });
    }
    await audit(appt.patient?.accountId || null, 'PAYMENT_FAILED', { appointmentId: appt.id, slotId: appt.slotId });
  } catch (err) {
    console.warn('[Appointments] failAppointment error:', err.message);
  }
}

// ---------------------------------------------------------------------
// My Booked Appointments
// ---------------------------------------------------------------------
router.get('/mine', requireAuth, requireRole('PATIENT'), async (req, res, next) => {
  try {
    const { scope, patientId } = req.query; // 'upcoming' | 'past' | 'today' | undefined (all)
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    // Build patient filter: scoped to active patient (or explicit patientId), unless patientId is 'all'
    const targetPatientId = patientId === 'all' ? null : (patientId || req.account.activePatientId);
    const patientFilter = targetPatientId
      ? { patientId: targetPatientId, patient: { accountId: req.account.id } }
      : { patient: { accountId: req.account.id } };

    let timeAndStatusFilter = {};
    if (scope === 'upcoming') {
      // Upcoming or active ongoing appointments: CONFIRMED or PENDING, not cancelled/completed, starting or ongoing today or in future
      timeAndStatusFilter = {
        status: { in: ['CONFIRMED', 'PENDING'] },
        OR: [
          { slot: { start: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) } } },
          { slot: { end: { gte: now } } },
        ],
      };
    } else if (scope === 'today') {
      timeAndStatusFilter = {
        status: { not: 'PENDING_PAYMENT' },
        slot: { start: { gte: startOfToday, lte: endOfToday } },
      };
    } else if (scope === 'past') {
      timeAndStatusFilter = {
        status: { not: 'PENDING_PAYMENT' },
        OR: [
          { status: { in: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] } },
          { slot: { start: { lt: new Date(now.getTime() - 2 * 60 * 60 * 1000) } }, status: { not: 'CONFIRMED' } },
        ],
      };
    } else {
      timeAndStatusFilter = {
        status: { not: 'PENDING_PAYMENT' },
      };
    }

    const appts = await prisma.appointment.findMany({
      where: {
        ...patientFilter,
        ...timeAndStatusFilter,
      },
      include: DETAIL_INCLUDE,
      orderBy: { slot: { start: scope === 'past' ? 'desc' : 'asc' } },
    });
    res.json({ appointments: appts.map(serialize) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const appt = await loadOwnedAppointment(req.params.id, req.account);
    await audit(req.account.id, 'RECORD_ACCESSED', { appointmentId: appt.id });
    res.json({ appointment: serialize(appt) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Upload documents (<4MB each), scoped to the active patient's appointment.
// ---------------------------------------------------------------------
router.post(
  '/:id/documents',
  requireAuth,
  requireRole('PATIENT'),
  requireActivePatient,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError(400, 'file is required', 'MISSING_FILE');
      const appt = await prisma.appointment.findUnique({ where: { id: req.params.id } });
      if (!appt || appt.patientId !== req.activePatient.id) {
        throw new ApiError(403, 'Documents can only be attached to the active patient’s own appointment', 'FORBIDDEN');
      }
      const { url } = await uploadFile({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
      });
      const doc = await prisma.document.create({
        data: {
          appointmentId: appt.id,
          fileUrl: url,
          fileName: req.file.originalname,
          sizeBytes: req.file.size,
        },
      });
      await audit(req.account.id, 'DOCUMENT_UPLOADED', { appointmentId: appt.id, documentId: doc.id });
      res.status(201).json({ document: doc });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Accept / Reject appointment (doctor actions)
// ---------------------------------------------------------------------
router.patch('/:id/accept', requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const appt = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: DETAIL_INCLUDE,
    });
    if (!appt || appt.doctor?.accountId !== req.account.id) {
      throw new ApiError(404, 'Appointment not found for this doctor', 'NOT_FOUND');
    }

    let videoLink = appt.videoLink;
    let videoRoomName = appt.videoRoomName;

    if (appt.mode === 'VIDEO' && !videoLink) {
      const room = await videoService.createMeeting(appt);
      videoLink = room.meetingUrl;
      videoRoomName = room.roomName || room.meetingId;
    }

    const updated = await prisma.appointment.update({
      where: { id: appt.id },
      data: { status: 'CONFIRMED', videoLink, videoRoomName },
      include: DETAIL_INCLUDE,
    });

    try {
      const account = await prisma.account.findUnique({ where: { id: updated.patient?.accountId } });
      const patientMobile = updated.patient?.mobile || account?.mobile;
      if (patientMobile) {
        await sendAppointmentConfirmation(patientMobile, {
          patientName: updated.patient?.name,
          doctorName: updated.doctor?.name,
          start: updated.slot?.start,
          mode: updated.mode,
          meetingUrl: updated.videoLink,
        });
      }
    } catch (notifErr) {
      console.error('[appointments] WhatsApp confirmation error:', notifErr.message);
    }

    broadcastSlotChange(updated.doctorId, updated.slot.start, { slotId: updated.slotId, status: 'BOOKED' });
    await audit(req.account.id, 'APPOINTMENT_ACCEPTED', { appointmentId: updated.id });

    res.json({ appointment: serialize(updated), ok: true });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/reject', requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const appt = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: DETAIL_INCLUDE,
    });
    if (!appt || appt.doctor?.accountId !== req.account.id) {
      throw new ApiError(404, 'Appointment not found for this doctor', 'NOT_FOUND');
    }

    await prisma.$transaction([
      prisma.appointment.update({ where: { id: appt.id }, data: { status: 'CANCELLED' } }),
      prisma.slot.update({
        where: { id: appt.slotId },
        data: { status: 'AVAILABLE', lockedAt: null, lockExpiresAt: null },
      }),
    ]);

    if (appt.payment?.status === 'SUCCESS' && appt.payment.gatewayPaymentId) {
      await refundPayment(appt.payment.gatewayPaymentId, { amountInPaise: Math.round(Number(appt.payment.amount) * 100) }).catch(() => {});
      await prisma.payment.update({ where: { appointmentId: appt.id }, data: { status: 'REFUNDED' } }).catch(() => {});
    }

    broadcastSlotChange(appt.doctorId, appt.slot.start, { slotId: appt.slotId, status: 'AVAILABLE' });
    await audit(req.account.id, 'APPOINTMENT_REJECTED', { appointmentId: appt.id });

    res.json({ ok: true, message: 'Appointment rejected and slot released.' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Join Call - pre-call window validation & instant room connectivity
// ---------------------------------------------------------------------
router.get('/:id/join', requireAuth, async (req, res, next) => {
  try {
    const appt = await loadOwnedAppointment(req.params.id, req.account);
    if (appt.mode !== 'VIDEO') throw new ApiError(400, 'Not a video appointment', 'NOT_VIDEO');
    if (appt.status !== 'CONFIRMED' && appt.status !== 'COMPLETED') {
      throw new ApiError(400, 'Appointment is not confirmed or accepted', 'NOT_CONFIRMED');
    }

    const joinBeforeMinutes = env.rules.joinCallWindowMinutesBefore || 15;
    const joinAfterMinutes = env.rules.joinCallWindowMinutesAfter || 120; // 2 hours
    const windowStart = new Date(new Date(appt.slot.start).getTime() - joinBeforeMinutes * 60 * 1000);
    const windowEnd = new Date(new Date(appt.slot.start).getTime() + joinAfterMinutes * 60 * 1000);

    // Check if meeting join time is over (exceeds 2-hour limit)
    if (Date.now() > windowEnd.getTime()) {
      return res.status(410).json({
        ready: false,
        expired: true,
        message: 'The meeting joining window has ended (2-hour limit reached from scheduled start time).',
        appointment: serialize(appt),
      });
    }

    let videoLink = appt.videoLink;
    if (!videoLink) {
      const room = await videoService.createMeeting(appt);
      videoLink = room.meetingUrl;
      await prisma.appointment.update({
        where: { id: appt.id },
        data: { videoLink, videoRoomName: room.roomName || room.meetingId },
      });
    }

    if (Date.now() < windowStart.getTime()) {
      return res.json({ ready: false, expired: false, opensAt: windowStart, videoLink: null, appointment: serialize(appt) });
    }

    await audit(req.account.id, 'VIDEO_CALL_JOINED', { appointmentId: appt.id, role: req.account.role });
    res.json({ ready: true, expired: false, videoLink, meetingId: appt.videoRoomName, appointment: serialize(appt), role: req.account.role });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Message Box - patient/doctor chat scoped to an appointment. Deliberately
// PATIENT/DOCTOR only: loadOwnedAppointment() below only checks ownership
// for those two roles (ADMIN's oversight elsewhere in the app is read-only
// metadata, e.g. GET /admin/appointments - it was never meant to extend to
// reading or posting into a private conversation), so this route-level
// gate is the actual enforcement, not just a formality.
// ---------------------------------------------------------------------
router.get('/:id/messages', requireAuth, requireRole('PATIENT', 'DOCTOR'), async (req, res, next) => {
  try {
    const appt = await loadOwnedAppointment(req.params.id, req.account);
    const messages = await prisma.message.findMany({ where: { appointmentId: appt.id }, orderBy: { createdAt: 'asc' } });
    res.json({ messages });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/messages', requireAuth, requireRole('PATIENT', 'DOCTOR'), async (req, res, next) => {
  try {
    const { body } = req.body || {};
    if (!body || !body.trim()) throw new ApiError(400, 'Message body is required', 'EMPTY_MESSAGE');
    const appt = await loadOwnedAppointment(req.params.id, req.account);
    const message = await prisma.message.create({
      data: { appointmentId: appt.id, senderRole: req.account.role, senderId: req.account.id, body: body.trim() },
    });
    res.status(201).json({ message });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.confirmAppointment = confirmAppointment;
module.exports.failAppointment = failAppointment;
module.exports.loadOwnedAppointment = loadOwnedAppointment;
module.exports.serialize = serialize;
