const express = require('express');
const prisma = require('../db/prisma');
const env = require('../config/env');
const { requireAuth, requireRole } = require('../middleware/auth');
const { refundPayment } = require('../integrations/payment');
const { broadcastSlotChange } = require('../realtime/io');
const { audit } = require('../utils/audit');
const { ApiError } = require('../utils/errors');
const { computeAge } = require('../utils/age');
const { serialize } = require('./appointments');
const { normalizeMobile, isValidMobile } = require('../utils/mobile');

const router = express.Router();
router.use(requireAuth, requireRole('ADMIN'));

// ---- Specialities ----
router.get('/specialities', async (req, res, next) => {
  try {
    res.json({ specialities: await prisma.speciality.findMany({ orderBy: { name: 'asc' } }) });
  } catch (err) {
    next(err);
  }
});

router.post('/specialities', async (req, res, next) => {
  try {
    const { name, keywords } = req.body || {};
    if (!name) throw new ApiError(400, 'name is required', 'MISSING_NAME');
    const speciality = await prisma.speciality.create({ data: { name, keywords: keywords || [] } });
    res.status(201).json({ speciality });
  } catch (err) {
    next(err);
  }
});

// ---- Doctors ----
router.get('/doctors', async (req, res, next) => {
  try {
    const doctors = await prisma.doctor.findMany({
      include: { speciality: true, account: true },
      orderBy: { name: 'asc' },
    });
    res.json({ doctors });
  } catch (err) {
    next(err);
  }
});

router.post('/doctors', async (req, res, next) => {
  try {
    const {
      mobile: rawMobile, name, specialityId, fee, rating, languages, experienceYrs, registrationNo, bio, photoUrl,
    } = req.body || {};
    if (!name || !specialityId || fee === undefined) {
      throw new ApiError(400, 'name, specialityId and fee are required', 'MISSING_FIELDS');
    }

    if (!rawMobile || !isValidMobile(rawMobile)) {
      throw new ApiError(400, 'A valid mobile number is required to register a doctor for login access', 'INVALID_MOBILE');
    }

    const mobile = normalizeMobile(rawMobile);
    if (mobile === env.reservedAdminMobile) {
      throw new ApiError(400, 'This number is reserved for the platform admin and cannot be onboarded as a doctor', 'RESERVED_ADMIN_MOBILE');
    }

    let account = await prisma.account.findUnique({ where: { mobile } });
    if (account) {
      const existingDoctor = await prisma.doctor.findUnique({ where: { accountId: account.id } });
      if (existingDoctor) {
        throw new ApiError(400, 'A doctor profile is already registered with this mobile number', 'DOCTOR_ALREADY_EXISTS');
      }
      account = await prisma.account.update({
        where: { id: account.id },
        data: { role: 'DOCTOR' },
      });
    } else {
      account = await prisma.account.create({
        data: { mobile, role: 'DOCTOR', verified: false },
      });
    }

    const doctor = await prisma.doctor.create({
      data: {
        accountId: account.id,
        name,
        specialityId,
        fee,
        rating: rating ?? 4.5,
        languages: languages || [],
        experienceYrs: experienceYrs || 0,
        registrationNo: registrationNo || null,
        bio: bio || null,
        photoUrl: photoUrl || null,
      },
      include: { speciality: true, account: true },
    });
    await audit(req.account.id, 'DOCTOR_ONBOARDED', { doctorId: doctor.id, mobile });
    res.status(201).json({ doctor });
  } catch (err) {
    next(err);
  }
});

router.put('/doctors/:id', async (req, res, next) => {
  try {
    const { active, fee, clinicFee, experienceYrs, rating, bio, registrationNo, photoUrl, languages, specialityId, name } = req.body || {};
    const data = {};
    if (active !== undefined) data.active = Boolean(active);
    if (fee !== undefined) data.fee = Number(fee);
    if (clinicFee !== undefined) data.clinicFee = Number(clinicFee);
    if (experienceYrs !== undefined) data.experienceYrs = parseInt(experienceYrs, 10);
    if (rating !== undefined) data.rating = Number(rating);
    if (bio !== undefined) data.bio = bio;
    if (registrationNo !== undefined) data.registrationNo = registrationNo;
    if (photoUrl !== undefined) data.photoUrl = photoUrl;
    if (languages !== undefined) data.languages = Array.isArray(languages) ? languages : [];
    if (specialityId !== undefined) data.specialityId = specialityId;
    if (name !== undefined) data.name = name;

    const doctor = await prisma.doctor.update({
      where: { id: req.params.id },
      data,
      include: { speciality: true, account: true },
    });
    await audit(req.account.id, 'DOCTOR_UPDATED', { doctorId: doctor.id });
    res.json({ doctor });
  } catch (err) {
    next(err);
  }
});

router.delete('/doctors/:id', async (req, res, next) => {
  try {
    const doctor = await prisma.doctor.findUnique({
      where: { id: req.params.id },
      include: {
        appointments: {
          where: { status: { in: ['CONFIRMED', 'PENDING_PAYMENT'] } },
        },
        account: true,
      },
    });
    if (!doctor) throw new ApiError(404, 'Doctor not found', 'NOT_FOUND');

    const { force } = req.query;
    if (doctor.appointments.length > 0 && force !== 'true') {
      throw new ApiError(
        400,
        `Doctor has ${doctor.appointments.length} active or pending appointment(s). Please cancel or complete them first, or confirm force delete.`,
        'DOCTOR_HAS_APPOINTMENTS'
      );
    }

    await prisma.$transaction(async (tx) => {
      // 1. Delete blocked periods
      await tx.blockedPeriod.deleteMany({ where: { doctorId: doctor.id } });

      // 2. Delete appointments & linked clinical/payment data
      const appts = await tx.appointment.findMany({ where: { doctorId: doctor.id }, select: { id: true } });
      const apptIds = appts.map((a) => a.id);
      if (apptIds.length > 0) {
        await tx.document.deleteMany({ where: { appointmentId: { in: apptIds } } });
        await tx.report.deleteMany({ where: { appointmentId: { in: apptIds } } });
        await tx.prescription.deleteMany({ where: { appointmentId: { in: apptIds } } });
        await tx.message.deleteMany({ where: { appointmentId: { in: apptIds } } });
        await tx.payment.deleteMany({ where: { appointmentId: { in: apptIds } } });
        await tx.appointment.deleteMany({ where: { doctorId: doctor.id } });
      }

      // 3. Delete slots
      await tx.slot.deleteMany({ where: { doctorId: doctor.id } });

      // 4. Delete doctor profile
      await tx.doctor.delete({ where: { id: doctor.id } });

      // 5. Clean up login account if exclusive to doctor
      if (doctor.accountId) {
        const patientCount = await tx.patient.count({ where: { accountId: doctor.accountId } });
        if (patientCount === 0) {
          await tx.otpSession.deleteMany({ where: { accountId: doctor.accountId } });
          await tx.auditLog.updateMany({ where: { accountId: doctor.accountId }, data: { accountId: null } });
          await tx.ticket.deleteMany({ where: { accountId: doctor.accountId } });
          await tx.query.deleteMany({ where: { accountId: doctor.accountId } });
          await tx.account.delete({ where: { id: doctor.accountId } });
        } else {
          await tx.account.update({ where: { id: doctor.accountId }, data: { role: 'PATIENT' } });
        }
      }
    });

    await audit(req.account.id, 'DOCTOR_DELETED', {
      doctorId: doctor.id,
      name: doctor.name,
      mobile: doctor.account?.mobile,
    });

    res.json({ ok: true, message: `Doctor ${doctor.name} was successfully deleted.` });
  } catch (err) {
    next(err);
  }
});

// ---- Slots ----
router.get('/slots', async (req, res, next) => {
  try {
    const { doctorId } = req.query;
    const slots = await prisma.slot.findMany({
      where: { ...(doctorId ? { doctorId: String(doctorId) } : {}) },
      orderBy: { start: 'asc' },
    });
    res.json({ slots });
  } catch (err) {
    next(err);
  }
});

/**
 * Bulk-create availability slots for a doctor. Skips any (start, mode) pair
 * that already has a slot for this doctor instead of creating a duplicate -
 * there's no DB-level unique constraint on this, so re-generating over an
 * already-covered range (an easy mistake in the admin UI) would otherwise
 * silently double up availability.
 */
router.post('/slots/bulk', async (req, res, next) => {
  try {
    const { doctorId, slots } = req.body || {};
    if (!doctorId || !Array.isArray(slots) || slots.length === 0) {
      throw new ApiError(400, 'doctorId and a non-empty slots array are required', 'MISSING_FIELDS');
    }
    for (const s of slots) {
      if (!s.start || !s.end || !['VIDEO', 'IN_CLINIC'].includes(s.mode)) {
        throw new ApiError(400, 'Each slot needs a valid start, end and mode', 'INVALID_SLOT');
      }
    }

    const starts = slots.map((s) => new Date(s.start));
    const existing = await prisma.slot.findMany({
      where: { doctorId, start: { in: starts } },
      select: { start: true, mode: true },
    });
    const existingKeys = new Set(existing.map((e) => `${e.start.toISOString()}|${e.mode}`));
    const toCreate = slots.filter((s) => !existingKeys.has(`${new Date(s.start).toISOString()}|${s.mode}`));

    const created = toCreate.length
      ? await prisma.$transaction(
          toCreate.map((s) =>
            prisma.slot.create({
              data: { doctorId, start: new Date(s.start), end: new Date(s.end), mode: s.mode },
            })
          )
        )
      : [];
    const skippedCount = slots.length - created.length;
    await audit(req.account.id, 'SLOTS_CREATED', { doctorId, count: created.length, skippedCount });
    res.status(201).json({ slots: created, createdCount: created.length, skippedCount });
  } catch (err) {
    next(err);
  }
});

router.delete('/slots/:id', async (req, res, next) => {
  try {
    const slot = await prisma.slot.findUnique({ where: { id: req.params.id } });
    if (!slot) throw new ApiError(404, 'Slot not found', 'NOT_FOUND');
    if (slot.status !== 'AVAILABLE') throw new ApiError(400, 'Only available slots can be removed', 'SLOT_NOT_AVAILABLE');
    await prisma.slot.update({ where: { id: slot.id }, data: { status: 'CANCELLED' } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- Appointments ----

// Only ever hard-delete appointments that are already in a terminal state -
// an active PENDING_PAYMENT/CONFIRMED one must go through /cancel first
// (which also releases its slot and refunds the payment); this endpoint is
// purely for clearing old history, not for cancelling something in-flight.
const DELETABLE_STATUSES = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

/** Deletes an appointment and every record that references it, in FK order. */
async function deleteAppointmentCascade(appointmentId) {
  await prisma.$transaction([
    prisma.message.deleteMany({ where: { appointmentId } }),
    prisma.document.deleteMany({ where: { appointmentId } }),
    prisma.report.deleteMany({ where: { appointmentId } }),
    prisma.prescription.deleteMany({ where: { appointmentId } }),
    prisma.payment.deleteMany({ where: { appointmentId } }),
    prisma.appointment.delete({ where: { id: appointmentId } }),
  ]);
}

router.get('/appointments', async (req, res, next) => {
  try {
    const { status, hasPrescription } = req.query;
    const where = {};
    if (status) where.status = String(status);
    if (hasPrescription === 'true') where.prescription = { isNot: null };

    const appts = await prisma.appointment.findMany({
      where,
      include: {
        doctor: { include: { speciality: true } },
        slot: true,
        patient: true,
        payment: { include: { promo: true } },
        prescription: true,
        report: true,
        documents: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ appointments: appts.map(serialize) });
  } catch (err) {
    next(err);
  }
});

// ---- Prescriptions ----
router.get('/prescriptions', async (req, res, next) => {
  try {
    const prescriptions = await prisma.prescription.findMany({
      include: {
        appointment: {
          include: {
            doctor: { include: { speciality: true } },
            patient: true,
            slot: true,
            payment: true,
            documents: true,
            report: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const list = prescriptions.map((p) => {
      const appt = p.appointment ? serialize({ ...p.appointment, prescription: p }) : null;
      return {
        id: p.id,
        appointmentId: p.appointmentId,
        medicines: p.medicines,
        notes: p.notes,
        fileUrl: p.fileUrl,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        doctor: appt?.doctor || null,
        patient: appt?.patient || null,
        slot: appt?.slot || null,
        appointment: appt,
      };
    });

    res.json({ prescriptions: list });
  } catch (err) {
    next(err);
  }
});

router.delete('/prescriptions/:id', async (req, res, next) => {
  try {
    let rx = await prisma.prescription.findUnique({
      where: { id: req.params.id },
      include: { appointment: { include: { doctor: true, patient: true } } },
    });
    if (!rx) {
      rx = await prisma.prescription.findUnique({
        where: { appointmentId: req.params.id },
        include: { appointment: { include: { doctor: true, patient: true } } },
      });
    }
    if (!rx) {
      throw new ApiError(404, 'Prescription not found', 'NOT_FOUND');
    }

    await prisma.prescription.delete({ where: { id: rx.id } });
    await audit(req.account.id, 'PRESCRIPTION_DELETED_BY_ADMIN', {
      prescriptionId: rx.id,
      appointmentId: rx.appointmentId,
      patient: rx.appointment?.patient?.name,
      doctor: rx.appointment?.doctor?.name,
    });
    res.json({ ok: true, message: 'Prescription successfully deleted.' });
  } catch (err) {
    next(err);
  }
});

router.post('/appointments/:id/cancel', async (req, res, next) => {
  try {
    const appt = await prisma.appointment.findUnique({ where: { id: req.params.id }, include: { payment: true, slot: true } });
    if (!appt) throw new ApiError(404, 'Appointment not found', 'NOT_FOUND');

    await prisma.$transaction([
      prisma.appointment.update({ where: { id: appt.id }, data: { status: 'CANCELLED' } }),
      prisma.slot.update({ where: { id: appt.slotId }, data: { status: 'AVAILABLE', lockedAt: null, lockExpiresAt: null } }),
    ]);

    if (appt.payment?.status === 'SUCCESS' && appt.payment.gatewayPaymentId) {
      await refundPayment(appt.payment.gatewayPaymentId, { amountInPaise: Math.round(Number(appt.payment.amount) * 100) });
      await prisma.payment.update({ where: { appointmentId: appt.id }, data: { status: 'REFUNDED' } });
    }
    broadcastSlotChange(appt.doctorId, appt.slot.start, { slotId: appt.slotId, status: 'AVAILABLE' });
    await audit(req.account.id, 'APPOINTMENT_CANCELLED_BY_ADMIN', { appointmentId: appt.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Permanently remove one past appointment's history (and its report/prescription/documents/messages/payment). */
router.delete('/appointments/:id', async (req, res, next) => {
  try {
    const appt = await prisma.appointment.findUnique({ where: { id: req.params.id }, include: { slot: true } });
    if (!appt) throw new ApiError(404, 'Appointment not found', 'NOT_FOUND');
    if (!DELETABLE_STATUSES.includes(appt.status)) {
      throw new ApiError(
        400,
        'Only completed, cancelled or no-show appointments can be permanently removed - cancel an active one first',
        'NOT_DELETABLE'
      );
    }

    // Capture identifying details in the audit trail before the row (and
    // its joins) are gone for good.
    await audit(req.account.id, 'APPOINTMENT_HISTORY_DELETED', {
      appointmentId: appt.id,
      patientId: appt.patientId,
      doctorId: appt.doctorId,
      slotStart: appt.slot.start,
      status: appt.status,
    });

    await deleteAppointmentCascade(appt.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Bulk-clear every past appointment already in a terminal state - a full history wipe, not a cancellation. */
router.post('/appointments/clear-history', async (req, res, next) => {
  try {
    const stale = await prisma.appointment.findMany({
      where: { status: { in: DELETABLE_STATUSES }, slot: { start: { lt: new Date() } } },
      select: { id: true },
    });
    for (const { id } of stale) {
      // eslint-disable-next-line no-await-in-loop
      await deleteAppointmentCascade(id);
    }
    await audit(req.account.id, 'APPOINTMENT_HISTORY_BULK_CLEARED', { count: stale.length });
    res.json({ ok: true, deletedCount: stale.length });
  } catch (err) {
    next(err);
  }
});

// ---- Payments ----
router.get('/payments', async (req, res, next) => {
  try {
    const payments = await prisma.payment.findMany({
      include: { appointment: { include: { patient: true, doctor: true } }, promo: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ payments });
  } catch (err) {
    next(err);
  }
});

// ---- Promo codes ----
router.get('/promo-codes', async (req, res, next) => {
  try {
    res.json({ promoCodes: await prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } }) });
  } catch (err) {
    next(err);
  }
});

router.post('/promo-codes', async (req, res, next) => {
  try {
    const { code, discountPct, expiry, maxUses } = req.body || {};
    if (!code || discountPct === undefined || !expiry) {
      throw new ApiError(400, 'code, discountPct and expiry are required', 'MISSING_FIELDS');
    }
    const promo = await prisma.promoCode.create({
      data: { code: code.trim().toUpperCase(), discountPct, expiry: new Date(expiry), maxUses: maxUses ?? null },
    });
    res.status(201).json({ promoCode: promo });
  } catch (err) {
    next(err);
  }
});

router.put('/promo-codes/:id', async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (data.expiry) data.expiry = new Date(data.expiry);
    if (data.code) data.code = data.code.trim().toUpperCase();
    const promo = await prisma.promoCode.update({ where: { id: req.params.id }, data });
    res.json({ promoCode: promo });
  } catch (err) {
    next(err);
  }
});

// ---- Support tickets ----
router.get('/tickets', async (req, res, next) => {
  try {
    const { status } = req.query;
    const tickets = await prisma.ticket.findMany({
      where: { ...(status ? { status: String(status) } : {}) },
      include: { account: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ tickets });
  } catch (err) {
    next(err);
  }
});

router.post('/tickets/:id/resolve', async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.update({
      where: { id: req.params.id },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

// ---- Clinical queries (route/reassign) ----
router.get('/queries', async (req, res, next) => {
  try {
    const queries = await prisma.query.findMany({
      include: { patient: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ queries });
  } catch (err) {
    next(err);
  }
});

router.post('/queries/:id/reassign', async (req, res, next) => {
  try {
    const { specialityId } = req.body || {};
    if (!specialityId) throw new ApiError(400, 'specialityId is required', 'MISSING_FIELDS');
    const query = await prisma.query.update({ where: { id: req.params.id }, data: { matchedSpecialityId: specialityId } });
    res.json({ query });
  } catch (err) {
    next(err);
  }
});

// ---- Platform config (fees, policies, OTP settings) ----
router.get('/config', async (req, res, next) => {
  try {
    const rows = await prisma.config.findMany();
    res.json({ config: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
  } catch (err) {
    next(err);
  }
});

router.put('/config/:key', async (req, res, next) => {
  try {
    const { value } = req.body || {};
    const row = await prisma.config.upsert({
      where: { key: req.params.key },
      update: { value },
      create: { key: req.params.key, value },
    });
    await audit(req.account.id, 'CONFIG_UPDATED', { key: row.key });
    res.json({ config: { [row.key]: row.value } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
