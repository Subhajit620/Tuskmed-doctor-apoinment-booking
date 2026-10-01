const express = require('express');
const rateLimit = require('express-rate-limit');
const prisma = require('../db/prisma');
const env = require('../config/env');
const { generateOtp, hashOtp, compareOtp } = require('../utils/otp');
const { setSessionCookie, clearSessionCookie, requireAuth } = require('../middleware/auth');
const { sendOtp } = require('../integrations/aisensy'); // OTP sending now goes through AiSensy, not Meta directly
const { audit } = require('../utils/audit');
const { ApiError } = require('../utils/errors');
const { normalizeMobile, isValidMobile } = require('../utils/mobile');

const router = express.Router();

// Rate-limit OTP endpoints per-IP to blunt brute force / spam (requirement:
// "rate-limits requests").
const otpRequestLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const otpVerifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

function serializeAccount(account) {
  return {
    id: account.id,
    mobile: account.mobile,
    role: account.role,
    verified: account.verified,
    acceptedPolicy: !!account.acceptedPolicyAt,
    activePatientId: account.activePatientId,
  };
}

/**
 * Step 1: request an OTP. Works identically for patient, doctor and admin
 * mobiles - the account's existing role decides the destination dashboard
 * after login. An unrecognised mobile is provisioned as a new PATIENT
 * account (self-registration); doctor/admin accounts are provisioned by
 * an admin ahead of time and simply get a fresh OTP here.
 */
router.post('/otp/request', otpRequestLimiter, async (req, res, next) => {
  try {
    const { mobile: rawMobile, intent } = req.body || {};
    if (!rawMobile || !isValidMobile(rawMobile)) {
      throw new ApiError(400, 'A valid mobile number is required', 'INVALID_MOBILE');
    }
    // Normalized so "8101421053", "+918101421053" and "918101421053" all
    // resolve to the exact same account - see utils/mobile.js.
    const mobile = normalizeMobile(rawMobile);

    let account = await prisma.account.findUnique({ where: { mobile } });

    // Doctor verification: Doctor has no self-registration.
    // Only admin can onboard doctors. Unregistered/inactive numbers must not receive OTP.
    if (intent === 'DOCTOR') {
      if (!account || account.role !== 'DOCTOR') {
        throw new ApiError(
          403,
          'This mobile number is not registered as a doctor. Only administrators can register doctors.',
          'DOCTOR_NOT_REGISTERED'
        );
      }
      const doctor = await prisma.doctor.findUnique({ where: { accountId: account.id } });
      if (!doctor || !doctor.active) {
        throw new ApiError(
          403,
          'Your doctor account is inactive. Please contact the clinic administrator.',
          'DOCTOR_INACTIVE'
        );
      }
    } else if (account && account.role === 'DOCTOR') {
      // If the account is a DOCTOR account (even without explicit intent), ensure active
      const doctor = await prisma.doctor.findUnique({ where: { accountId: account.id } });
      if (!doctor || !doctor.active) {
        throw new ApiError(
          403,
          'Your doctor account is inactive. Please contact the clinic administrator.',
          'DOCTOR_INACTIVE'
        );
      }
    }

    if (!account) {
      // The reserved admin number provisions straight into ADMIN on first
      // login - everyone else self-registers as PATIENT as usual.
      const role = mobile === env.reservedAdminMobile ? 'ADMIN' : 'PATIENT';
      account = await prisma.account.create({ data: { mobile, role } });
    }

    // Cooldown: block a fresh OTP if one was sent very recently.
    const recent = await prisma.otpSession.findFirst({
      where: { accountId: account.id, consumed: false },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      const secondsSinceSend = (Date.now() - new Date(recent.lastSentAt).getTime()) / 1000;
      if (secondsSinceSend < env.rules.otpResendCooldownSeconds) {
        throw new ApiError(
          429,
          `Please wait ${Math.ceil(env.rules.otpResendCooldownSeconds - secondsSinceSend)}s before requesting another code`,
          'OTP_COOLDOWN'
        );
      }
    }

    const code = generateOtp();
    const codeHash = await hashOtp(code);
    const expiresAt = new Date(Date.now() + env.rules.otpExpiryMinutes * 60 * 1000);

    const otpSession = await prisma.otpSession.create({
      data: { accountId: account.id, codeHash, expiresAt, maxAttempts: env.rules.otpMaxAttempts },
    });

    try {
      await sendOtp(mobile, code);
    } catch (sendErr) {
      // Never leak the WhatsApp provider's raw error to the client - log it
      // for debugging and undo the session so this failed attempt doesn't
      // also strand the user behind a resend cooldown for a code they
      // never received.
      // eslint-disable-next-line no-console
      console.error('[auth] WhatsApp OTP send failed:', sendErr.message);
      await prisma.otpSession.delete({ where: { id: otpSession.id } }).catch(() => {});
      await audit(account.id, 'OTP_SEND_FAILED', { mobile, reason: sendErr.message });
      throw new ApiError(502, 'We could not send your verification code right now. Please try again in a moment.', 'OTP_SEND_FAILED');
    }
    await audit(account.id, 'OTP_REQUESTED', { mobile });

    res.json({
      otpId: otpSession.id,
      expiresInSeconds: env.rules.otpExpiryMinutes * 60,
      resendCooldownSeconds: env.rules.otpResendCooldownSeconds,
      // Only ever surfaced when running fully mocked, to make manual/dev
      // testing possible without a real WhatsApp number.
      devCode: env.mock.whatsapp ? code : undefined,
    });
  } catch (err) {
    next(err);
  }
});

/** Resend, subject to cooldown and a max resend count. */
router.post('/otp/resend', otpRequestLimiter, async (req, res, next) => {
  try {
    const { otpId } = req.body || {};
    const otpSession = otpId && (await prisma.otpSession.findUnique({ where: { id: otpId } }));
    if (!otpSession || otpSession.consumed) {
      throw new ApiError(400, 'OTP session not found or already used', 'INVALID_OTP_SESSION');
    }
    const secondsSinceSend = (Date.now() - new Date(otpSession.lastSentAt).getTime()) / 1000;
    if (secondsSinceSend < env.rules.otpResendCooldownSeconds) {
      throw new ApiError(429, 'Please wait before resending', 'OTP_COOLDOWN');
    }
    if (otpSession.resendCount >= env.rules.otpMaxResends) {
      throw new ApiError(429, 'Maximum resend attempts reached. Please try again later.', 'OTP_MAX_RESENDS');
    }

    const account = await prisma.account.findUnique({ where: { id: otpSession.accountId } });
    const code = generateOtp();
    const codeHash = await hashOtp(code);
    const expiresAt = new Date(Date.now() + env.rules.otpExpiryMinutes * 60 * 1000);

    const updated = await prisma.otpSession.update({
      where: { id: otpSession.id },
      data: { codeHash, expiresAt, lastSentAt: new Date(), resendCount: { increment: 1 }, attempts: 0 },
    });

    try {
      await sendOtp(account.mobile, code);
    } catch (sendErr) {
      // eslint-disable-next-line no-console
      console.error('[auth] WhatsApp OTP resend failed:', sendErr.message);
      await audit(account.id, 'OTP_SEND_FAILED', { mobile: account.mobile, reason: sendErr.message });
      throw new ApiError(502, 'We could not resend your verification code right now. Please try again in a moment.', 'OTP_SEND_FAILED');
    }
    await audit(account.id, 'OTP_RESENT', { mobile: account.mobile });

    res.json({
      otpId: updated.id,
      expiresInSeconds: env.rules.otpExpiryMinutes * 60,
      resendCooldownSeconds: env.rules.otpResendCooldownSeconds,
      devCode: env.mock.whatsapp ? code : undefined,
    });
  } catch (err) {
    next(err);
  }
});

/** Step 2: verify the code and establish a session. */
router.post('/otp/verify', otpVerifyLimiter, async (req, res, next) => {
  try {
    const { otpId, code } = req.body || {};
    if (!otpId || !code) throw new ApiError(400, 'otpId and code are required', 'MISSING_FIELDS');

    const otpSession = await prisma.otpSession.findUnique({ where: { id: otpId } });
    if (!otpSession || otpSession.consumed) {
      throw new ApiError(400, 'OTP session not found or already used', 'INVALID_OTP_SESSION');
    }
    if (otpSession.attempts >= otpSession.maxAttempts) {
      throw new ApiError(429, 'Too many incorrect attempts. Please request a new code.', 'OTP_MAX_ATTEMPTS');
    }
    if (new Date(otpSession.expiresAt).getTime() < Date.now()) {
      throw new ApiError(400, 'This code has expired. Please request a new one.', 'OTP_EXPIRED');
    }

    const valid = await compareOtp(code, otpSession.codeHash);
    if (!valid) {
      await prisma.otpSession.update({ where: { id: otpSession.id }, data: { attempts: { increment: 1 } } });
      throw new ApiError(400, 'Incorrect code', 'OTP_INCORRECT');
    }

    await prisma.otpSession.update({ where: { id: otpSession.id }, data: { consumed: true } });
    const account = await prisma.account.update({
      where: { id: otpSession.accountId },
      data: { verified: true },
    });

    setSessionCookie(res, account);
    await audit(account.id, 'LOGIN_SUCCESS', { mobile: account.mobile, role: account.role });

    res.json({ account: serializeAccount(account), needsPolicyAcceptance: !account.acceptedPolicyAt });
  } catch (err) {
    next(err);
  }
});

/** First-time registration requires accepting the privacy policy/terms. */
router.post('/accept-policy', requireAuth, async (req, res, next) => {
  try {
    const account = await prisma.account.update({
      where: { id: req.account.id },
      data: { acceptedPolicyAt: new Date() },
    });
    await audit(account.id, 'POLICY_ACCEPTED', {});
    res.json({ account: serializeAccount(account) });
  } catch (err) {
    next(err);
  }
});

const { computeAge } = require('../utils/age');

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    let patients = req.account.role === 'PATIENT'
      ? await prisma.patient.findMany({ where: { accountId: req.account.id }, orderBy: { createdAt: 'asc' } })
      : [];

    if (req.account.role === 'PATIENT' && patients.length === 0) {
      const defaultPatient = await prisma.patient.create({
        data: {
          accountId: req.account.id,
          name: 'My Profile',
          mobile: req.account.mobile,
          dob: new Date('1998-01-01'),
          gender: 'OTHER',
        },
      });
      req.account = await prisma.account.update({
        where: { id: req.account.id },
        data: { activePatientId: defaultPatient.id },
      });
      patients = [defaultPatient];
    }

    const serializedPatients = patients.map((p) => ({ ...p, age: computeAge(p.dob) }));
    res.json({ account: serializeAccount(req.account), patients: serializedPatients });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    clearSessionCookie(res);
    await audit(req.account.id, 'LOGOUT', {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
