const express = require('express');
const prisma = require('../db/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const { computeAge } = require('../utils/age');
const { ApiError } = require('../utils/errors');
const { serialize } = require('./appointments');
const { askGenAi } = require('../integrations/genAi');
const videoService = require('../services/video/videoService');
const { sendAppointmentConfirmation } = require('../integrations/whatsapp');
const { broadcastSlotChange, broadcastConsultationEvent } = require('../realtime/io');
const { refundPayment } = require('../integrations/payment');

const router = express.Router();
router.use(requireAuth, requireRole('DOCTOR'));

async function currentDoctor(req) {
  let doctor = await prisma.doctor.findUnique({ where: { accountId: req.account.id }, include: { account: true } });
  if (!doctor && req.account?.role === 'ADMIN') {
    doctor = await prisma.doctor.findFirst({ include: { account: true } });
  }
  if (!doctor) throw new ApiError(403, 'No doctor profile linked to this account', 'NO_DOCTOR_PROFILE');
  return doctor;
}

const DETAIL_INCLUDE = {
  doctor: { include: { speciality: true } },
  slot: true,
  patient: true,
  payment: { include: { promo: true } },
  documents: true,
  report: true,
  prescription: true,
};

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// ---------------------------------------------------------------------
// Left-nav profile summary + live counters
// ---------------------------------------------------------------------
router.get('/summary', async (req, res, next) => {
  try {
    const doctor = await currentDoctor(req);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [todayCount, monthCount, distinctPatients] = await Promise.all([
      prisma.appointment.count({
        where: { doctorId: doctor.id, status: { in: ['CONFIRMED', 'COMPLETED'] }, slot: { start: { gte: startOfDay(), lte: endOfDay() } } },
      }),
      prisma.appointment.count({
        where: { doctorId: doctor.id, status: { in: ['CONFIRMED', 'COMPLETED'] }, slot: { start: { gte: monthStart, lte: monthEnd } } },
      }),
      prisma.appointment.findMany({
        where: { doctorId: doctor.id, status: { in: ['CONFIRMED', 'COMPLETED'] } },
        select: { patientId: true },
        distinct: ['patientId'],
      }),
    ]);

    res.json({
      profile: {
        id: doctor.id,
        name: doctor.name,
        speciality: doctor.speciality?.name,
        photoUrl: doctor.photoUrl,
        registrationNo: doctor.registrationNo,
      },
      counters: {
        todayAppointments: todayCount,
        consultsThisMonth: monthCount,
        patientsConsulted: distinctPatients.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Screen 6: View Profile
// ---------------------------------------------------------------------
const DOCTOR_EDITABLE_FIELDS = [
  'title', 'firstName', 'middleName', 'lastName', 'email', 'sex', 'dob', 'address', 'clinicLocation',
  'specialityId', 'registrationNo', 'experienceYrs', 'fee', 'clinicFee', 'languages', 'photoUrl', 'bio',
];
// Admin-only - see admin.js PUT /doctors/:id. Mobile lives on Account and is
// never editable by anyone through the API (it's the login identity).
const DOCTOR_LOCKED_FIELDS = ['city', 'state'];

function serializeDoctorProfile(doctor) {
  return {
    id: doctor.id,
    mobile: doctor.account?.mobile || null, // locked
    city: doctor.city, // locked
    state: doctor.state, // locked
    title: doctor.title,
    firstName: doctor.firstName,
    middleName: doctor.middleName,
    lastName: doctor.lastName,
    name: doctor.name,
    email: doctor.email,
    sex: doctor.sex,
    dob: doctor.dob,
    address: doctor.address,
    clinicLocation: doctor.clinicLocation,
    specialityId: doctor.specialityId,
    speciality: doctor.speciality?.name,
    registrationNo: doctor.registrationNo,
    experienceYrs: doctor.experienceYrs,
    fee: doctor.fee,
    clinicFee: doctor.clinicFee,
    languages: doctor.languages,
    photoUrl: doctor.photoUrl,
    bio: doctor.bio,
    rating: doctor.rating,
  };
}

router.get('/me', async (req, res, next) => {
  try {
    const doctor = await currentDoctor(req);
    const full = await prisma.doctor.findUnique({ where: { id: doctor.id }, include: { account: true, speciality: true } });
    res.json({ doctor: serializeDoctorProfile(full) });
  } catch (err) {
    next(err);
  }
});

/**
 * Doctor self-service profile edit. Mobile/city/state are deliberately
 * ignored here even if sent - those fields say "cannot be changed" in the
 * UI and can only be set by an admin (admin.js PUT /admin/doctors/:id).
 */
router.put('/me', async (req, res, next) => {
  try {
    const doctor = await currentDoctor(req);
    const body = req.body || {};

    const rejected = Object.keys(body).filter((k) => DOCTOR_LOCKED_FIELDS.includes(k) || k === 'mobile');
    const data = {};
    for (const field of DOCTOR_EDITABLE_FIELDS) {
      if (body[field] !== undefined) data[field] = body[field];
    }
    if (data.dob) data.dob = new Date(data.dob);
    if (data.fee !== undefined) data.fee = Number(data.fee);
    if (data.clinicFee !== undefined) data.clinicFee = Number(data.clinicFee);
    if (data.experienceYrs !== undefined) data.experienceYrs = parseInt(data.experienceYrs, 10);

    // Keep the single display `name` field (used everywhere else in the
    // app - booking, admin, patient-facing cards) in sync with the
    // structured name parts whenever any of them change.
    if (data.title !== undefined || data.firstName !== undefined || data.middleName !== undefined || data.lastName !== undefined) {
      const merged = {
        title: data.title !== undefined ? data.title : doctor.title,
        firstName: data.firstName !== undefined ? data.firstName : doctor.firstName,
        middleName: data.middleName !== undefined ? data.middleName : doctor.middleName,
        lastName: data.lastName !== undefined ? data.lastName : doctor.lastName,
      };
      const composed = [merged.title, merged.firstName, merged.middleName, merged.lastName]
        .filter((p) => p && p.trim())
        .join(' ');
      if (composed) data.name = composed;
    }

    const updated = await prisma.doctor.update({
      where: { id: doctor.id },
      data,
      include: { account: true, speciality: true },
    });
    await audit(req.account.id, 'DOCTOR_PROFILE_UPDATED', { doctorId: doctor.id, rejectedFields: rejected });
    res.json({ doctor: serializeDoctorProfile(updated), rejectedFields: rejected });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Screen 1: Dashboard (Home) - Today / Next 30 Days
// ---------------------------------------------------------------------
router.get('/appointments', async (req, res, next) => {
  try {
    const doctor = await currentDoctor(req);
    const { scope } = req.query;
    const now = new Date();

    let range;
    let statusFilter = { in: ['CONFIRMED', 'COMPLETED'] };

    if (scope === 'today') {
      range = { gte: startOfDay(), lte: endOfDay() };
    } else if (scope === 'next30') {
      range = { gte: now, lte: endOfDay(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)) };
    } else if (scope === 'upcoming') {
      range = { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) };
    } else if (scope === 'past') {
      range = { lt: new Date(now.getTime() - 2 * 60 * 60 * 1000) };
    } else if (scope === 'requests') {
      statusFilter = 'PENDING_PAYMENT';
    } else if (scope === 'prescriptions') {
      statusFilter = { in: ['CONFIRMED', 'COMPLETED'] };
    }

    const appts = await prisma.appointment.findMany({
      where: {
        doctorId: doctor.id,
        status: statusFilter,
        ...(range ? { slot: { start: range } } : {}),
        ...(scope === 'prescriptions' ? { prescription: { isNot: null } } : {}),
      },
      include: DETAIL_INCLUDE,
      orderBy: { slot: { start: (scope === 'past' || scope === 'prescriptions') ? 'desc' : 'asc' } },
    });
    res.json({ appointments: appts.map(serialize) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Screen 2: Your Past Appointments - search, date range, pagination
// ---------------------------------------------------------------------
router.get('/appointments/past', async (req, res, next) => {
  try {
    const doctor = await currentDoctor(req);
    const { search, from, to, mode } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = [5, 10, 25].includes(parseInt(req.query.pageSize, 10)) ? parseInt(req.query.pageSize, 10) : 10;

    const where = {
      doctorId: doctor.id,
      status: { in: ['CONFIRMED', 'COMPLETED', 'NO_SHOW'] },
      slot: {
        start: {
          lt: new Date(),
          ...(from ? { gte: new Date(`${from}T00:00:00.000`) } : {}),
          ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}),
        },
      },
      ...(search ? { patient: { name: { contains: String(search), mode: 'insensitive' } } } : {}),
      ...(['VIDEO', 'IN_CLINIC'].includes(mode) ? { mode } : {}),
    };

    const [total, appts] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.findMany({
        where,
        include: DETAIL_INCLUDE,
        orderBy: { slot: { start: 'desc' } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const rows = appts.map((a) => ({
      ...serialize(a),
      patient: { ...serialize(a).patient, age: computeAge(a.patient.dob) },
      prescriptionSent: !!a.prescription,
    }));

    res.json({ appointments: rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  } catch (err) {
    next(err);
  }
});

async function loadOwnAppointment(req) {
  const doctor = await currentDoctor(req);
  const appt = await prisma.appointment.findUnique({ where: { id: req.params.id }, include: DETAIL_INCLUDE });
  if (!appt || appt.doctorId !== doctor.id) throw new ApiError(404, 'Appointment not found', 'NOT_FOUND');
  return appt;
}

/** Doctor creates a report linked to the appointment. */
router.post('/appointments/:id/report', async (req, res, next) => {
  try {
    const appt = await loadOwnAppointment(req);
    const { content, fileUrl } = req.body || {};
    if (!content || !content.trim()) throw new ApiError(400, 'content is required', 'MISSING_CONTENT');
    const report = await prisma.report.upsert({
      where: { appointmentId: appt.id },
      update: { content: content.trim(), fileUrl: fileUrl || null },
      create: { appointmentId: appt.id, content: content.trim(), fileUrl: fileUrl || null },
    });
    await audit(req.account.id, 'REPORT_CREATED', { appointmentId: appt.id });
    res.status(201).json({ report });
  } catch (err) {
    next(err);
  }
});

/** Doctor creates a prescription linked to the appointment - flips the "Prescription Sent" badge. */
router.post('/appointments/:id/prescription', async (req, res, next) => {
  try {
    const appt = await loadOwnAppointment(req);
    const { medicines, notes, fileUrl } = req.body || {};
    if (!Array.isArray(medicines) || medicines.length === 0) {
      throw new ApiError(400, 'medicines must be a non-empty array', 'MISSING_MEDICINES');
    }
    const prescription = await prisma.prescription.upsert({
      where: { appointmentId: appt.id },
      update: { medicines, notes: notes || null, fileUrl: fileUrl || null },
      create: { appointmentId: appt.id, medicines, notes: notes || null, fileUrl: fileUrl || null },
    });
    broadcastConsultationEvent(appt.id, 'prescription:issued', { prescription });
    await audit(req.account.id, 'PRESCRIPTION_CREATED', { appointmentId: appt.id });
    res.status(201).json({ prescription });
  } catch (err) {
    next(err);
  }
});

/** Doctor accepts appointment -> generates video room & meeting URL and sends WhatsApp notification to patient */
router.post('/appointments/:id/accept', async (req, res, next) => {
  try {
    const doctor = await currentDoctor(req);
    const appt = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: DETAIL_INCLUDE,
    });
    if (!appt || appt.doctorId !== doctor.id) {
      throw new ApiError(404, 'Appointment not found for this doctor', 'NOT_FOUND');
    }

    let videoLink = appt.videoLink;
    let videoRoomName = appt.videoRoomName;

    // Generate meeting room if it's a video appointment and doesn't have one yet
    if (appt.mode === 'VIDEO' && !videoLink) {
      const room = await videoService.createMeeting(appt);
      videoLink = room.meetingUrl;
      videoRoomName = room.roomName || room.meetingId;
    }

    const updated = await prisma.appointment.update({
      where: { id: appt.id },
      data: {
        status: 'CONFIRMED',
        videoLink,
        videoRoomName,
      },
      include: DETAIL_INCLUDE,
    });

    // Send WhatsApp notification
    try {
      const account = await prisma.account.findUnique({ where: { id: updated.patient?.accountId } });
      const patientMobile = updated.patient?.mobile || account?.mobile;
      if (patientMobile) {
        await sendAppointmentConfirmation(patientMobile, {
          patientName: updated.patient?.name,
          doctorName: doctor.name,
          start: updated.slot?.start,
          mode: updated.mode,
          meetingUrl: updated.videoLink,
        });
      }
    } catch (notifErr) {
      console.error('[doctorPortal] WhatsApp notification failed:', notifErr.message);
    }

    broadcastSlotChange(doctor.id, updated.slot.start, { slotId: updated.slotId, status: 'BOOKED' });
    await audit(req.account.id, 'APPOINTMENT_ACCEPTED', { appointmentId: updated.id });

    res.json({ appointment: serialize(updated), ok: true });
  } catch (err) {
    next(err);
  }
});

/** Doctor rejects appointment -> releases slot back to available and refunds payment */
router.post('/appointments/:id/reject', async (req, res, next) => {
  try {
    const doctor = await currentDoctor(req);
    const appt = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: DETAIL_INCLUDE,
    });
    if (!appt || appt.doctorId !== doctor.id) {
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

    broadcastSlotChange(doctor.id, appt.slot.start, { slotId: appt.slotId, status: 'AVAILABLE' });
    await audit(req.account.id, 'APPOINTMENT_REJECTED', { appointmentId: appt.id });

    res.json({ ok: true, message: 'Appointment rejected and slot released.' });
  } catch (err) {
    next(err);
  }
});

router.post('/appointments/:id/complete', async (req, res, next) => {
  try {
    const appt = await loadOwnAppointment(req);
    const updated = await prisma.appointment.update({ where: { id: appt.id }, data: { status: 'COMPLETED' } });
    if (appt.videoRoomName) {
      await videoService.endMeeting(appt.videoRoomName).catch(() => {});
    }
    broadcastConsultationEvent(appt.id, 'consultation:ended', { completed: true, doctorName: doctor.name });
    await audit(req.account.id, 'APPOINTMENT_COMPLETED', { appointmentId: appt.id });
    res.json({ appointment: serialize(updated) });
  } catch (err) {
    next(err);
  }
});

router.get('/appointments/:id/join', async (req, res, next) => {
  try {
    const appt = await loadOwnAppointment(req);
    if (appt.mode !== 'VIDEO') throw new ApiError(400, 'Not a video appointment', 'NOT_VIDEO');

    let videoLink = appt.videoLink;
    if (!videoLink) {
      const room = await videoService.createMeeting(appt);
      videoLink = room.meetingUrl;
      await prisma.appointment.update({
        where: { id: appt.id },
        data: { videoLink, videoRoomName: room.roomName || room.meetingId },
      });
    }

    await audit(req.account.id, 'VIDEO_CALL_JOINED', { appointmentId: appt.id, role: 'DOCTOR' });
    res.json({ ready: true, videoLink, meetingId: appt.videoRoomName, appointment: serialize(appt) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Screen 3: Update Calendar
// ---------------------------------------------------------------------

/** "Your Blocked Days" table. */
router.get('/blocked-periods', async (req, res, next) => {
  try {
    const doctor = await currentDoctor(req);
    const periods = await prisma.blockedPeriod.findMany({ where: { doctorId: doctor.id }, orderBy: { startDate: 'asc' } });
    res.json({ blockedPeriods: periods });
  } catch (err) {
    next(err);
  }
});

/** "Block Full Days" tab. Prevents new bookings only - existing confirmed appointments are untouched. */
router.post('/blocked-periods', async (req, res, next) => {
  try {
    const doctor = await currentDoctor(req);
    const { startDate, endDate, mode } = req.body || {};
    if (!startDate || !endDate || !mode) throw new ApiError(400, 'startDate, endDate and mode are required', 'MISSING_FIELDS');
    if (!['VIDEO', 'IN_CLINIC', 'BOTH'].includes(mode)) throw new ApiError(400, 'Invalid mode', 'INVALID_MODE');

    const start = new Date(`${startDate}T00:00:00.000`);
    const end = new Date(`${endDate}T23:59:59.999`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new ApiError(400, 'Invalid date range', 'INVALID_RANGE');
    }

    const period = await prisma.blockedPeriod.create({
      data: { doctorId: doctor.id, startDate: start, endDate: end, mode },
    });
    await audit(req.account.id, 'DAYS_BLOCKED', { doctorId: doctor.id, startDate, endDate, mode });
    res.status(201).json({ blockedPeriod: period });
  } catch (err) {
    next(err);
  }
});

router.delete('/blocked-periods/:id', async (req, res, next) => {
  try {
    const doctor = await currentDoctor(req);
    const period = await prisma.blockedPeriod.findUnique({ where: { id: req.params.id } });
    if (!period || period.doctorId !== doctor.id) throw new ApiError(404, 'Blocked period not found', 'NOT_FOUND');
    await prisma.blockedPeriod.delete({ where: { id: period.id } });
    await audit(req.account.id, 'BLOCKED_PERIOD_REMOVED', { doctorId: doctor.id, blockedPeriodId: period.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** "Edit Slots by Date" tab: list a date's slots so individual ones can be toggled. */
router.get('/slots', async (req, res, next) => {
  try {
    const doctor = await currentDoctor(req);
    const { date } = req.query;
    if (!date) throw new ApiError(400, 'date is required', 'MISSING_DATE');
    const dayStart = new Date(`${date}T00:00:00.000`);
    const dayEnd = new Date(`${date}T23:59:59.999`);
    const slots = await prisma.slot.findMany({
      where: { doctorId: doctor.id, start: { gte: dayStart, lte: dayEnd } },
      orderBy: { start: 'asc' },
    });
    res.json({ slots });
  } catch (err) {
    next(err);
  }
});

/** Add a new slot on a chosen date (fills gaps the standard template doesn't cover). */
router.post('/slots', async (req, res, next) => {
  try {
    const doctor = await currentDoctor(req);
    const { start, end, mode } = req.body || {};
    if (!start || !end || !mode) throw new ApiError(400, 'start, end and mode are required', 'MISSING_FIELDS');
    const slot = await prisma.slot.create({
      data: { doctorId: doctor.id, start: new Date(start), end: new Date(end), mode },
    });
    res.status(201).json({ slot });
  } catch (err) {
    next(err);
  }
});

/** Enable/disable one slot. Disabling an AVAILABLE slot cancels it; re-enabling flips it back. Booked/locked slots can't be toggled. */
router.patch('/slots/:id/toggle', async (req, res, next) => {
  try {
    const doctor = await currentDoctor(req);
    const slot = await prisma.slot.findUnique({ where: { id: req.params.id } });
    if (!slot || slot.doctorId !== doctor.id) throw new ApiError(404, 'Slot not found', 'NOT_FOUND');
    if (!['AVAILABLE', 'CANCELLED'].includes(slot.status)) {
      throw new ApiError(400, 'Only available or already-disabled slots can be toggled', 'SLOT_NOT_TOGGLEABLE');
    }
    const nextStatus = slot.status === 'AVAILABLE' ? 'CANCELLED' : 'AVAILABLE';
    const updated = await prisma.slot.update({ where: { id: slot.id }, data: { status: nextStatus } });
    res.json({ slot: updated });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Screen 4: Financial Statements
// ---------------------------------------------------------------------
function monthRange(year, month) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10); // 1-12
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}

/** Monthly List of Consults: Date | Patient | Service | Fee */
router.get('/finance/monthly', async (req, res, next) => {
  try {
    const doctor = await currentDoctor(req);
    const { year, month } = req.query;
    if (!year || !month) throw new ApiError(400, 'year and month are required', 'MISSING_FIELDS');
    const { start, end } = monthRange(year, month);

    const payments = await prisma.payment.findMany({
      where: {
        status: 'SUCCESS',
        appointment: { doctorId: doctor.id, slot: { start: { gte: start, lte: end } } },
      },
      include: { appointment: { include: { patient: true, slot: true } } },
      orderBy: { appointment: { slot: { start: 'asc' } } },
    });

    const rows = payments.map((p) => ({
      date: p.appointment.slot.start,
      patient: p.appointment.patient.name,
      service: p.appointment.mode === 'VIDEO' ? 'Video consultation' : 'In-clinic consultation',
      fee: p.amount,
    }));
    res.json({ consults: rows });
  } catch (err) {
    next(err);
  }
});

/** Summary of Payments: total earnings over the selected period. */
router.get('/finance/summary', async (req, res, next) => {
  try {
    const doctor = await currentDoctor(req);
    const { year, month } = req.query;
    if (!year || !month) throw new ApiError(400, 'year and month are required', 'MISSING_FIELDS');
    const { start, end } = monthRange(year, month);

    const payments = await prisma.payment.findMany({
      where: {
        status: 'SUCCESS',
        appointment: { doctorId: doctor.id, slot: { start: { gte: start, lte: end } } },
      },
    });
    const totalEarnings = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    res.json({ totalEarnings, consultCount: payments.length, period: { year, month } });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Screen 5: Your Patients
// ---------------------------------------------------------------------
router.get('/patients', async (req, res, next) => {
  try {
    const doctor = await currentDoctor(req);
    const appts = await prisma.appointment.findMany({
      where: { doctorId: doctor.id, status: { in: ['CONFIRMED', 'COMPLETED'] } },
      include: { patient: true },
      distinct: ['patientId'],
      orderBy: { createdAt: 'desc' },
    });
    const patients = appts.map((a) => ({
      id: a.patient.id,
      name: a.patient.name,
      age: computeAge(a.patient.dob),
      gender: a.patient.gender,
    }));
    res.json({ patients });
  } catch (err) {
    next(err);
  }
});

/** Patient detail, scoped strictly to this doctor's own history with them. */
router.get('/patients/:id', async (req, res, next) => {
  try {
    const doctor = await currentDoctor(req);
    const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
    if (!patient) throw new ApiError(404, 'Patient not found', 'NOT_FOUND');

    const appts = await prisma.appointment.findMany({
      where: { doctorId: doctor.id, patientId: patient.id, status: { in: ['CONFIRMED', 'COMPLETED', 'NO_SHOW'] } },
      include: DETAIL_INCLUDE,
      orderBy: { slot: { start: 'desc' } },
    });
    if (appts.length === 0) throw new ApiError(403, 'This patient has no history with you', 'FORBIDDEN');

    await audit(req.account.id, 'RECORD_ACCESSED', { patientId: patient.id, byDoctorId: doctor.id });

    res.json({
      patient: { id: patient.id, name: patient.name, age: computeAge(patient.dob), gender: patient.gender, email: patient.email, mobile: patient.mobile, city: patient.city, state: patient.state },
      appointments: appts.map(serialize),
      documents: appts.flatMap((a) => a.documents),
      prescriptions: appts.filter((a) => a.prescription).map((a) => ({ appointmentId: a.id, date: a.slot.start, ...a.prescription })),
      reports: appts.filter((a) => a.report).map((a) => ({ appointmentId: a.id, date: a.slot.start, ...a.report })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Screen 7: Ask Gen AI
// ---------------------------------------------------------------------
router.post('/ask-ai', async (req, res, next) => {
  try {
    const { question } = req.body || {};
    if (!question || !question.trim()) throw new ApiError(400, 'question is required', 'MISSING_QUESTION');
    const answer = await askGenAi(question.trim());
    await audit(req.account.id, 'GEN_AI_QUERY', { questionLength: question.length });
    res.json({ answer });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
