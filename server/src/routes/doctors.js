const express = require('express');
const prisma = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/** A doctor's currently-active blocked date ranges, for filtering slot lists. */
async function getBlockedPeriods(doctorId) {
  return prisma.blockedPeriod.findMany({ where: { doctorId, endDate: { gte: new Date() } } });
}

function isBlocked(blockedPeriods, date, mode) {
  const t = new Date(date).getTime();
  return blockedPeriods.some(
    (bp) => t >= new Date(bp.startDate).getTime() && t <= new Date(bp.endDate).getTime() && (bp.mode === 'BOTH' || bp.mode === mode)
  );
}

function serializeDoctor(doctor, nextSlot) {
  return {
    id: doctor.id,
    name: doctor.name,
    speciality: doctor.speciality?.name,
    specialityId: doctor.specialityId,
    fee: doctor.fee,
    rating: doctor.rating,
    languages: doctor.languages,
    experienceYrs: doctor.experienceYrs,
    registrationNo: doctor.registrationNo,
    bio: doctor.bio,
    photoUrl: doctor.photoUrl,
    // Private contact details are intentionally never included here -
    // booking goes through the appointment flow, not direct contact.
    nextAvailableSlot: nextSlot
      ? { id: nextSlot.id, start: nextSlot.start, mode: nextSlot.mode }
      : null,
  };
}

/**
 * Our Doctors: browse/search/filter by speciality and availability.
 * `availableOnly=true` restricts to doctors that currently have at least
 * one AVAILABLE future slot.
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { specialityId, q, availableOnly, mode } = req.query;

    const doctors = await prisma.doctor.findMany({
      where: {
        active: true,
        ...(specialityId ? { specialityId: String(specialityId) } : {}),
        ...(q ? { name: { contains: String(q), mode: 'insensitive' } } : {}),
      },
      include: { speciality: true },
      orderBy: { rating: 'desc' },
    });

    const now = new Date();
    const results = [];
    for (const doctor of doctors) {
      const blockedPeriods = await getBlockedPeriods(doctor.id);
      const candidates = await prisma.slot.findMany({
        where: {
          doctorId: doctor.id,
          status: 'AVAILABLE',
          start: { gte: now },
          ...(mode ? { mode: String(mode) } : {}),
        },
        orderBy: { start: 'asc' },
        take: 20, // enough to skip past a short blocked stretch
      });
      let nextSlot = candidates.find((s) => !isBlocked(blockedPeriods, s.start, s.mode)) || null;
      if (!nextSlot) {
        const todayStr = now.toISOString().split('T')[0];
        const tomorrow = new Date(now.getTime() + 86400000);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        await ensureDoctorSlotsForDate(doctor.id, todayStr);
        await ensureDoctorSlotsForDate(doctor.id, tomorrowStr);
        const freshCandidates = await prisma.slot.findMany({
          where: {
            doctorId: doctor.id,
            status: 'AVAILABLE',
            start: { gte: now },
            ...(mode ? { mode: String(mode) } : {}),
          },
          orderBy: { start: 'asc' },
          take: 20,
        });
        nextSlot = freshCandidates.find((s) => !isBlocked(blockedPeriods, s.start, s.mode)) || null;
      }
      if (availableOnly === 'true' && !nextSlot) continue;
      results.push(serializeDoctor(doctor, nextSlot));
    }

    res.json({ doctors: results });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const doctor = await prisma.doctor.findUnique({
      where: { id: req.params.id },
      include: { speciality: true },
    });
    if (!doctor) return res.status(404).json({ error: { message: 'Doctor not found', code: 'NOT_FOUND' } });
    let nextSlot = await prisma.slot.findFirst({
      where: { doctorId: doctor.id, status: 'AVAILABLE', start: { gte: new Date() } },
      orderBy: { start: 'asc' },
    });
    if (!nextSlot) {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const tomorrow = new Date(now.getTime() + 86400000);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      await ensureDoctorSlotsForDate(doctor.id, todayStr);
      await ensureDoctorSlotsForDate(doctor.id, tomorrowStr);
      nextSlot = await prisma.slot.findFirst({
        where: { doctorId: doctor.id, status: 'AVAILABLE', start: { gte: now } },
        orderBy: { start: 'asc' },
      });
    }
    res.json({ doctor: serializeDoctor(doctor, nextSlot) });
  } catch (err) {
    next(err);
  }
});

const DEFAULT_SCHEDULE = [
  // Morning slots (08:30 AM - 12:30 PM IST)
  { hour: 3, minute: 0, duration: 30, mode: 'VIDEO' },
  { hour: 3, minute: 30, duration: 30, mode: 'IN_CLINIC' },
  { hour: 4, minute: 0, duration: 30, mode: 'VIDEO' },
  { hour: 4, minute: 30, duration: 30, mode: 'VIDEO' },
  { hour: 5, minute: 0, duration: 30, mode: 'IN_CLINIC' },
  { hour: 5, minute: 30, duration: 30, mode: 'VIDEO' },
  { hour: 6, minute: 0, duration: 30, mode: 'VIDEO' },
  { hour: 6, minute: 30, duration: 30, mode: 'IN_CLINIC' },

  // Afternoon slots (12:30 PM - 05:00 PM IST)
  { hour: 7, minute: 0, duration: 30, mode: 'VIDEO' },
  { hour: 8, minute: 0, duration: 30, mode: 'IN_CLINIC' },
  { hour: 8, minute: 30, duration: 30, mode: 'VIDEO' },
  { hour: 9, minute: 0, duration: 30, mode: 'VIDEO' },
  { hour: 9, minute: 30, duration: 30, mode: 'IN_CLINIC' },
  { hour: 10, minute: 0, duration: 30, mode: 'VIDEO' },
  { hour: 10, minute: 30, duration: 30, mode: 'VIDEO' },
  { hour: 11, minute: 0, duration: 30, mode: 'IN_CLINIC' },

  // Evening slots (05:00 PM - 10:30 PM IST)
  { hour: 11, minute: 30, duration: 30, mode: 'VIDEO' },
  { hour: 12, minute: 0, duration: 30, mode: 'VIDEO' },
  { hour: 12, minute: 30, duration: 30, mode: 'IN_CLINIC' },
  { hour: 13, minute: 0, duration: 30, mode: 'VIDEO' },
  { hour: 13, minute: 30, duration: 30, mode: 'VIDEO' },
  { hour: 14, minute: 0, duration: 30, mode: 'IN_CLINIC' },
  { hour: 14, minute: 30, duration: 30, mode: 'VIDEO' },
  { hour: 15, minute: 0, duration: 30, mode: 'VIDEO' },
  { hour: 15, minute: 30, duration: 30, mode: 'VIDEO' },
  { hour: 16, minute: 0, duration: 30, mode: 'VIDEO' },
  { hour: 16, minute: 30, duration: 30, mode: 'VIDEO' },
];

async function ensureDoctorSlotsForDate(doctorId, dateStr) {
  try {
    const parts = String(dateStr).split('-');
    if (parts.length !== 3) return;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (!year || !month || !day) return;

    const dayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

    const count = await prisma.slot.count({
      where: {
        doctorId,
        start: { gte: dayStart, lte: dayEnd },
      },
    });

    if (count === 0) {
      const data = DEFAULT_SCHEDULE.map((s) => {
        const start = new Date(Date.UTC(year, month - 1, day, s.hour, s.minute, 0, 0));
        const end = new Date(start.getTime() + s.duration * 60000);
        return {
          doctorId,
          start,
          end,
          mode: s.mode,
          status: 'AVAILABLE',
        };
      });
      await prisma.slot.createMany({ data, skipDuplicates: true });
    }
  } catch (err) {
    // Non-fatal if slot creation fails
  }
}

/**
 * Available slots for a doctor on a given date + mode. Populated only once
 * date, doctor and mode are all chosen (Book Appointment step 1).
 */
router.get('/:id/slots', requireAuth, async (req, res, next) => {
  try {
    const { date, mode } = req.query;
    if (!date) return res.status(400).json({ error: { message: 'date is required', code: 'MISSING_DATE' } });

    await ensureDoctorSlotsForDate(req.params.id, String(date));

    const dayStart = new Date(`${date}T00:00:00.000`);
    const dayEnd = new Date(`${date}T23:59:59.999`);
    const dayStartUtc = new Date(`${date}T00:00:00.000Z`);
    const dayEndUtc = new Date(`${date}T23:59:59.999Z`);

    if (Number.isNaN(dayStart.getTime()) || Number.isNaN(dayStartUtc.getTime())) {
      return res.status(400).json({ error: { message: 'Invalid date', code: 'INVALID_DATE' } });
    }

    const minStart = new Date(Math.min(dayStart.getTime(), dayStartUtc.getTime()) - 3600000);
    const maxEnd = new Date(Math.max(dayEnd.getTime(), dayEndUtc.getTime()) + 3600000);

    const slots = await prisma.slot.findMany({
      where: {
        doctorId: req.params.id,
        status: 'AVAILABLE',
        start: { gte: minStart, lte: maxEnd },
        ...(mode ? { mode: String(mode) } : {}),
      },
      orderBy: { start: 'asc' },
    });
    // Never surface a slot that has already passed, even if same-day, or
    // one the doctor has blocked (blocking hides slots without deleting them).
    const now = new Date();
    const blockedPeriods = await getBlockedPeriods(req.params.id);
    res.json({
      slots: slots.filter(
        (s) => new Date(s.start).getTime() > now.getTime() && !isBlocked(blockedPeriods, s.start, s.mode)
      ),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
