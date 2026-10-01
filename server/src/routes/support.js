const express = require('express');
const prisma = require('../db/prisma');
const { requireAuth } = require('../middleware/auth');
const { generateTicketReference } = require('../utils/otp');
const { audit } = require('../utils/audit');
const { ApiError } = require('../utils/errors');

const router = express.Router();

const CHANNELS = [
  { type: 'whatsapp', label: 'WhatsApp', value: '+91-9000-000-000' },
  { type: 'email', label: 'Email', value: 'support@tuskmed.example' },
  { type: 'phone', label: 'Phone', value: '1800-000-0000' },
];

const CATEGORIES = ['Billing', 'Appointment Issue', 'Technical', 'Prescription/Report', 'Feedback', 'Other'];

/** Help & Support: contact channels + categorised query -> ticket reference. */
router.get('/channels', requireAuth, (req, res) => {
  res.json({ channels: CHANNELS, categories: CATEGORIES });
});

router.post('/tickets', requireAuth, async (req, res, next) => {
  try {
    const { category, description } = req.body || {};
    if (!category || !CATEGORIES.includes(category)) throw new ApiError(400, 'Invalid category', 'INVALID_CATEGORY');
    if (!description || !description.trim()) throw new ApiError(400, 'description is required', 'MISSING_DESCRIPTION');

    let reference;
    // Practically always succeeds on first try; loop guards the unique constraint.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      reference = generateTicketReference();
      // eslint-disable-next-line no-await-in-loop
      const clash = await prisma.ticket.findUnique({ where: { reference } });
      if (!clash) break;
    }

    const ticket = await prisma.ticket.create({
      data: { accountId: req.account.id, category, description: description.trim(), reference },
    });
    await audit(req.account.id, 'SUPPORT_TICKET_CREATED', { ticketId: ticket.id, reference });
    res.status(201).json({ ticket });
  } catch (err) {
    next(err);
  }
});

router.get('/tickets/mine', requireAuth, async (req, res, next) => {
  try {
    const tickets = await prisma.ticket.findMany({ where: { accountId: req.account.id }, orderBy: { createdAt: 'desc' } });
    res.json({ tickets });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
