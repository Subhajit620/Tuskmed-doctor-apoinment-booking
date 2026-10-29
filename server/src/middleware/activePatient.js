const prisma = require('../db/prisma');
const { ApiError } = require('../utils/errors');

/**
 * Enforces the "active-patient context" rule: every booking, report,
 * prescription and upload must be validated against the account's
 * currently-selected active patient before the write proceeds.
 */
async function requireActivePatient(req, res, next) {
  try {
    const account = req.account;
    if (!account.activePatientId) {
      throw new ApiError(400, 'No active patient selected. Choose a patient profile first.', 'NO_ACTIVE_PATIENT');
    }
    const patient = await prisma.patient.findUnique({ where: { id: account.activePatientId } });
    if (!patient || patient.accountId !== account.id) {
      throw new ApiError(400, 'Active patient is invalid for this account.', 'INVALID_ACTIVE_PATIENT');
    }
    req.activePatient = patient;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireActivePatient };


