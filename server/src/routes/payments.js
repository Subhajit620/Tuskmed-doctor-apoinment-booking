const express = require('express');
const prisma = require('../db/prisma');
const { verifyWebhookSignature } = require('../integrations/payment');
const { confirmAppointment, failAppointment } = require('./appointments');
const { audit } = require('../utils/audit');

const router = express.Router();

/**
 * Server-to-server payment gateway webhook (Razorpay-shaped). This is the
 * durable confirmation path - it works even if the patient's browser
 * closes right after paying, before the client-side callback fires.
 * Mounted with express.raw() in index.js so the signature can be verified
 * against the exact bytes Razorpay signed.
 */
router.post('/webhook', async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    if (!verifyWebhookSignature(rawBody, signature)) {
      return res.status(400).json({ error: { message: 'Invalid webhook signature', code: 'BAD_SIGNATURE' } });
    }

    const event = JSON.parse(rawBody.toString('utf8') || '{}');
    const paymentEntity = event?.payload?.payment?.entity;
    if (!paymentEntity) return res.json({ ok: true, ignored: true });

    const payment = await prisma.payment.findFirst({ where: { gatewayOrderId: paymentEntity.order_id } });
    if (!payment) return res.json({ ok: true, ignored: true });

    const appt = await prisma.appointment.findUnique({
      where: { id: payment.appointmentId },
      include: { doctor: true, slot: true, patient: true, payment: { include: { promo: true } } },
    });
    if (!appt || appt.status !== 'PENDING_PAYMENT') return res.json({ ok: true, alreadyFinal: true });

    const isSuccess = event.event === 'payment.captured' || paymentEntity.status === 'captured';
    if (isSuccess) {
      await confirmAppointment(appt, paymentEntity.id);
    } else {
      await failAppointment(appt);
    }
    await audit(null, 'PAYMENT_WEBHOOK', { appointmentId: appt.id, event: event.event });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
