const express = require('express');
const prisma = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const specialities = await prisma.speciality.findMany({ orderBy: { name: 'asc' } });
    res.json({ specialities });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
