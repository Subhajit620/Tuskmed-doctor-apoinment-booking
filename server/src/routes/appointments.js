const express = require('express');
const multer = require('multer');
const prisma = require('../db/prisma');
const env = require('../config/env');
const { requireAuth, optionalAuth, requireRole } = require('../middleware/auth');
const { requireActivePatient } = require('../middleware/activePatient');
const { evaluatePromo } = require('../utils/promo');
const { createOrder, verifyPaymentSignature, refundPayment } = require('../integrations/payment');
const { createRoom, videoService } = require('../integrations/video');
const { uploadFile } = require('../integrations/storage');
const { sendAppointmentConfirmation, sendDoctorAppointmentNotification } = require('../integrations/whatsapp');
const { ensureBookingConfirmationMessages } = require('../utils/appointmentMessages');
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

    const blocked = await prisma.blockedPeriod.findFirst({
      where: {
        doctorId,
        startDate: { lte: slot.start },
        endDate: { gte: slot.start },
        OR: [{ mode: 'BOTH' }, { mode }],
      },
    });
    if (blocked) throw new ApiError(409, 'This doctor is unavailable on the selected date. Please pick another.', 'DATE_BLOCKED');

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
          status: 'CONFIRMED',
          isFollowUp: !!priorVisit,
        },
      });

      // createRoom needs the appointment id, so the room is made after the
      // insert and patched back in - same order as confirmAppointment.
      let videoLink = null;
      if (mode === 'VIDEO') {
        try {
          const room = await createRoom(appointment.id, slot.start);
          videoLink = room?.url || null;
          if (videoLink) {
            appointment = await prisma.appointment.update({
              where: { id: appointment.id },
              data: { videoLink, videoRoomName: room.name || room.meetingId },
            });
          }
        } catch (roomErr) {
          console.error('[appointments] video room creation failed:', roomErr.message);
        }
      }

      // Notifications must never break a confirmed booking: the enclosing
      // catch rolls back the slot and DELETES the appointment, so every
      // WhatsApp / Message Box failure has to be swallowed right here.
      try {
        await ensureBookingConfirmationMessages({
          appointmentId: appointment.id,
          doctorName: doctor.name,
          patientName: req.activePatient?.name,
          start: slot.start,
          mode,
          meetingUrl: appointment.videoLink,
        });
      } catch (msgErr) {
        console.error('[appointments] confirmation message box insert failed:', msgErr.message);
      }

      try {
        if (req.activePatient?.mobile) {
          await sendAppointmentConfirmation(req.activePatient.mobile, {
            appointmentId: appointment.id,
            doctorName: doctor.name,
            start: slot.start,
            mode,
            patientName: req.activePatient.name,
            meetingUrl: appointment.videoLink,
          });
          console.log(`[appointments] patient notified at ${req.activePatient.mobile}`);
        } else {
          console.warn(`[appointments] patient ${req.activePatient.id} has no mobile`);
        }

        if (doctor.accountId) {
          const doctorAccount = await prisma.account.findUnique({
            where: { id: doctor.accountId },
          });
          if (doctorAccount?.mobile) {
            await sendDoctorAppointmentNotification(doctorAccount.mobile, {
              appointmentId: appointment.id,
              doctorName: doctor.name,
              patientName: req.activePatient?.name,
              start: slot.start,
              mode,
              meetingUrl: appointment.videoLink,
            });
            console.log(`[appointments] doctor notified at ${doctorAccount.mobile}`);
          } else {
            console.warn(`[appointments] doctor ${doctor.id} has no mobile`);
          }
        } else {
          console.warn(`[appointments] doctor ${doctor.id} has no linked account`);
        }
      } catch (notifErr) {
        console.error('[appointments] notification failed:', notifErr.message);
      }

      broadcastSlotChange(doctorId, slot.start, { slotId, status: 'LOCKED' });
      await audit(req.account.id, 'APPOINTMENT_BOOKING_STARTED', {
        appointmentId: appointment.id,
        slotId,
        patientId: req.activePatient.id,
      });

      res.status(201).json({
        appointmentId: appointment.id,
        slotLockExpiresAt: lockExpiresAt,
        fee: doctor.fee,
        discountAmount: evaluation.discountAmount,
        amountDue: evaluation.finalAmount,
        paymentRequired: false,
      });
    } catch (innerErr) {
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
    await ensureBookingConfirmationMessages({
      appointmentId: finalAppt.id,
      doctorName: finalAppt.doctor?.name,
      patientName: finalAppt.patient?.name,
      start: finalAppt.slot?.start,
      mode: finalAppt.mode,
      meetingUrl: finalAppt.videoLink,
    });
  } catch (msgErr) {
    console.warn('[MessageBox] Could not insert confirmation message:', msgErr.message);
  }

  try {
    // 1. Send confirmation to Patient
    const patientAccount = await prisma.account.findUnique({ where: { id: finalAppt.patient?.accountId } });
    const patientMobile = finalAppt.patient?.mobile || patientAccount?.mobile;
    if (patientMobile) {
      await sendAppointmentConfirmation(patientMobile, {
        appointmentId: finalAppt.id,
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
          appointmentId: finalAppt.id,
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
        status: { in: ['CONFIRMED'] },
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
      await ensureBookingConfirmationMessages({
        appointmentId: updated.id,
        doctorName: updated.doctor?.name,
        patientName: updated.patient?.name,
        start: updated.slot?.start,
        mode: updated.mode,
        meetingUrl: updated.videoLink,
      });
    } catch (msgErr) {
      console.error('[appointments] Message Box confirmation error:', msgErr.message);
    }

    try {
      const account = await prisma.account.findUnique({ where: { id: updated.patient?.accountId } });
      const patientMobile = updated.patient?.mobile || account?.mobile;
      if (patientMobile) {
        await sendAppointmentConfirmation(patientMobile, {
          appointmentId: updated.id,
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
// Supports both logged-in users and direct WhatsApp consultation link access
// ---------------------------------------------------------------------
router.get('/:id/join', optionalAuth, async (req, res, next) => {
  try {
    const appt = req.account
      ? await loadOwnedAppointment(req.params.id, req.account)
      : await prisma.appointment.findUnique({ where: { id: req.params.id }, include: DETAIL_INCLUDE });
    if (!appt) throw new ApiError(404, 'Appointment not found', 'NOT_FOUND');
    if (appt.mode !== 'VIDEO') throw new ApiError(400, 'Not a video appointment', 'NOT_VIDEO');
    if (appt.status !== 'CONFIRMED' && appt.status !== 'COMPLETED') {
      throw new ApiError(400, 'Appointment is not confirmed or accepted', 'NOT_CONFIRMED');
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

    const effectiveRole = req.account?.role || (req.query.role === 'DOCTOR' ? 'DOCTOR' : 'PATIENT');
    if (req.account) {
      await audit(req.account.id, 'VIDEO_CALL_JOINED', { appointmentId: appt.id, role: effectiveRole });
    }
    res.json({ ready: true, expired: false, videoLink, meetingId: appt.videoRoomName, appointment: serialize(appt), role: effectiveRole });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Message Box - patient/doctor chat scoped to an appointment.
// ---------------------------------------------------------------------
router.get('/:id/messages', optionalAuth, async (req, res, next) => {
  try {
    const appt = req.account
      ? await loadOwnedAppointment(req.params.id, req.account)
      : await prisma.appointment.findUnique({ where: { id: req.params.id }, include: DETAIL_INCLUDE });
    if (!appt) throw new ApiError(404, 'Appointment not found', 'NOT_FOUND');

    // Ensure confirmed appointments always have the booking confirmation + video link message in the Message Box
    if (appt.status === 'CONFIRMED' && appt.slot?.start) {
      await ensureBookingConfirmationMessages({
        appointmentId: appt.id,
        doctorName: appt.doctor?.name,
        patientName: appt.patient?.name,
        start: appt.slot.start,
        mode: appt.mode,
        meetingUrl: appt.videoLink,
      }).catch(() => {});
    }

    const effectiveRole = req.account?.role || (req.query.role === 'DOCTOR' ? 'DOCTOR' : 'PATIENT');
    const excludedSystemSender = effectiveRole === 'PATIENT' ? 'SYSTEM_DOCTOR' : 'SYSTEM_PATIENT';
    const messages = await prisma.message.findMany({
      where: {
        appointmentId: appt.id,
        senderId: { not: excludedSystemSender },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({
      messages: messages.map((m) => ({
        ...m,
        content: m.body,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/messages', optionalAuth, async (req, res, next) => {
  try {
    const rawBody = req.body?.body || req.body?.content;
    if (!rawBody || !String(rawBody).trim()) throw new ApiError(400, 'Message body is required', 'EMPTY_MESSAGE');
    const appt = req.account
      ? await loadOwnedAppointment(req.params.id, req.account)
      : await prisma.appointment.findUnique({ where: { id: req.params.id }, include: DETAIL_INCLUDE });
    if (!appt) throw new ApiError(404, 'Appointment not found', 'NOT_FOUND');

    const senderRole = req.account?.role || (req.body?.role === 'DOCTOR' ? 'DOCTOR' : 'PATIENT');
    const senderId = req.account?.id || (senderRole === 'DOCTOR' ? appt.doctorId : appt.patientId);
    const message = await prisma.message.create({
      data: { appointmentId: appt.id, senderRole, senderId, body: String(rawBody).trim() },
    });
    res.status(201).json({ message: { ...message, content: message.body } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.confirmAppointment = confirmAppointment;
module.exports.failAppointment = failAppointment;
module.exports.loadOwnedAppointment = loadOwnedAppointment;
module.exports.serialize = serialize;
