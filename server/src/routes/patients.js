const express = require('express');
const prisma = require('../db/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const { ApiError } = require('../utils/errors');

const router = express.Router();
router.use(requireAuth, requireRole('PATIENT'));

const GENDERS = ['MALE', 'FEMALE', 'OTHER'];

function computeAge(dob) {
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function serialize(patient) {
  return { ...patient, age: computeAge(patient.dob) };
}

/** List + search family-member profiles under this account. */
router.get('/', async (req, res, next) => {
  try {
    const { q } = req.query;
    const patients = await prisma.patient.findMany({
      where: {
        accountId: req.account.id,
        ...(q ? { name: { contains: String(q), mode: 'insensitive' } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ patients: patients.map(serialize), activePatientId: req.account.activePatientId });
  } catch (err) {
    next(err);
  }
});

/** Register a new family-member profile. */
router.post('/', async (req, res, next) => {
  try {
    const { name, mobile, email, dob, gender, state, city } = req.body || {};
    if (!name || !dob || !gender) {
      throw new ApiError(400, 'name, dob and gender are required', 'MISSING_FIELDS');
    }
    if (!GENDERS.includes(gender)) throw new ApiError(400, 'Invalid gender', 'INVALID_GENDER');

    const dobDate = new Date(dob);
    if (Number.isNaN(dobDate.getTime())) throw new ApiError(400, 'Invalid date of birth', 'INVALID_DOB');
    if (dobDate.getTime() > Date.now()) {
      throw new ApiError(400, 'Date of birth cannot be in the future', 'DOB_IN_FUTURE');
    }

    const patient = await prisma.patient.create({
      data: { accountId: req.account.id, name, mobile, email, dob: dobDate, gender, state, city },
    });

    // First patient registered on the account becomes active automatically.
    let account = req.account;
    if (!account.activePatientId) {
      account = await prisma.account.update({
        where: { id: account.id },
        data: { activePatientId: patient.id },
      });
    }

    await audit(req.account.id, 'PATIENT_REGISTERED', { patientId: patient.id });
    res.status(201).json({ patient: serialize(patient), activePatientId: account.activePatientId });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.patient.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.accountId !== req.account.id) {
      throw new ApiError(404, 'Patient not found', 'NOT_FOUND');
    }
    const { name, mobile, email, dob, gender, state, city } = req.body || {};
    const data = {};
    if (name !== undefined) data.name = name;
    if (mobile !== undefined) data.mobile = mobile;
    if (email !== undefined) data.email = email;
    if (gender !== undefined) {
      if (!GENDERS.includes(gender)) throw new ApiError(400, 'Invalid gender', 'INVALID_GENDER');
      data.gender = gender;
    }
    if (state !== undefined) data.state = state;
    if (city !== undefined) data.city = city;
    if (dob !== undefined) {
      const dobDate = new Date(dob);
      if (Number.isNaN(dobDate.getTime())) throw new ApiError(400, 'Invalid date of birth', 'INVALID_DOB');
      if (dobDate.getTime() > Date.now()) throw new ApiError(400, 'Date of birth cannot be in the future', 'DOB_IN_FUTURE');
      data.dob = dobDate;
    }
    const patient = await prisma.patient.update({ where: { id: existing.id }, data });
    res.json({ patient: serialize(patient) });
  } catch (err) {
    next(err);
  }
});

/** Switch the active patient - persists on the account, applies everywhere. */
router.patch('/active', async (req, res, next) => {
  try {
    const { patientId } = req.body || {};
    if (!patientId) throw new ApiError(400, 'patientId is required', 'MISSING_FIELDS');
    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient || patient.accountId !== req.account.id) {
      throw new ApiError(404, 'Patient not found for this account', 'NOT_FOUND');
    }
    const account = await prisma.account.update({
      where: { id: req.account.id },
      data: { activePatientId: patient.id },
    });
    await audit(req.account.id, 'ACTIVE_PATIENT_CHANGED', { patientId: patient.id });
    res.json({ activePatientId: account.activePatientId, patient: serialize(patient) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
