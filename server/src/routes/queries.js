const express = require('express');
const prisma = require('../db/prisma');
const multer = require('multer');
const env = require('../config/env');
const { requireAuth, requireRole } = require('../middleware/auth');
const { requireActivePatient } = require('../middleware/activePatient');
const { uploadFile } = require('../integrations/storage');
const { audit } = require('../utils/audit');
const { ApiError } = require('../utils/errors');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.rules.maxUploadBytes } });

const MAX_LEN = 500;

/**
 * Post Query - free-text symptom description that routes to a matched
 * specialist. Distinct from Help & Support: this is clinical triage, not
 * a support ticket. Naive keyword match against Speciality.keywords, with
 * a generic-physician fallback so every query resolves to *something*.
 */
async function matchSpeciality(description, category) {
  const specialities = await prisma.speciality.findMany();
  const text = `${description} ${category || ''}`.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const s of specialities) {
    const score = (s.keywords || []).reduce((acc, kw) => (text.includes(kw.toLowerCase()) ? acc + 1 : acc), 0);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  if (!best) {
    best = specialities.find((s) => s.name === 'General Physician') || specialities[0] || null;
  }
  return best;
}

router.post(
  '/',
  requireAuth,
  requireRole('PATIENT'),
  requireActivePatient,
  upload.single('attachment'),
  async (req, res, next) => {
    try {
      const { description, category } = req.body || {};
      if (!description || !description.trim()) throw new ApiError(400, 'description is required', 'EMPTY_QUERY');
      if (description.length > MAX_LEN) throw new ApiError(400, `description must be ${MAX_LEN} characters or fewer`, 'TOO_LONG');

      let attachmentUrl = null;
      if (req.file) {
        const uploaded = await uploadFile({
          buffer: req.file.buffer,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
        });
        attachmentUrl = uploaded.url;
      }

      const speciality = await matchSpeciality(description, category);
      const doctors = speciality
        ? await prisma.doctor.findMany({ where: { specialityId: speciality.id, active: true }, orderBy: { rating: 'desc' }, take: 5 })
        : [];

      const query = await prisma.query.create({
        data: {
          accountId: req.account.id,
          patientId: req.activePatient.id,
          description: description.trim(),
          category: category || null,
          attachmentUrl,
          matchedSpecialityId: speciality?.id || null,
          status: 'ROUTED',
        },
      });

      await audit(req.account.id, 'QUERY_POSTED', { queryId: query.id, specialityId: speciality?.id });

      res.status(201).json({
        query,
        matchedSpeciality: speciality ? { id: speciality.id, name: speciality.name } : null,
        recommendedDoctors: doctors,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/mine', requireAuth, requireRole('PATIENT'), async (req, res, next) => {
  try {
    const queries = await prisma.query.findMany({ where: { accountId: req.account.id }, orderBy: { createdAt: 'desc' } });
    res.json({ queries });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
