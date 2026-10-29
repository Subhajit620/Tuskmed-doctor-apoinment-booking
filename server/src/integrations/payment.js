const crypto = require('crypto');
const env = require('../config/env');

/**
 * Payment gateway integration (2 of 4) - full implementation.
 *
 * Real mode uses the official `razorpay` SDK (order creation, signature
 * verification, refunds, and payment reconciliation). No raw card data
 * ever touches this server: the client-side Checkout collects card/UPI
 * details directly with Razorpay and only an opaque order/payment id +
 * signature comes back to us.
 *
 * Mock mode (default, no credentials required) simulates every call below
 * deterministically so the full booking -> pay -> confirm -> refund
 * lifecycle is testable without network access or real keys.
 */

let razorpayClient = null;
function getClient() {
  if (razorpayClient) return razorpayClient;
  // eslint-disable-next-line global-require
  const Razorpay = require('razorpay');
  razorpayClient = new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
  return razorpayClient;
}

function isLive() {
  return !env.mock.payment && !!env.razorpay.keyId && !!env.razorpay.keySecret;
}

/**
 * Create a payment order for an appointment. `notes` carries our own
 * appointmentId/patientId so a webhook or the Razorpay dashboard can be
 * traced back to the booking without a separate lookup table.
 */
async function createOrder({ amountInPaise, receipt, notes = {} }) {
  if (!isLive()) {
    return {
      mocked: true,
      id: `order_mock_${crypto.randomBytes(8).toString('hex')}`,
      amount: amountInPaise,
      currency: 'INR',
      receipt,
      notes,
      status: 'created',
      keyId: env.razorpay.keyId || 'rzp_test_mock',
    };
  }

  const order = await getClient().orders.create({
    amount: amountInPaise,
    currency: 'INR',
    receipt,
    notes,
    payment_capture: 1, // auto-capture - no manual capture step required
  });
  return { ...order, keyId: env.razorpay.keyId };
}

/**
 * Verify the signature Razorpay's Checkout hands back to the client after
 * payment (order_id + payment_id + signature). In mock mode, the caller
 * supplies `mockOutcome` ('success' | 'failure') so tests can exercise
 * both the happy path and the failure/slot-release path deterministically.
 */
function verifyPaymentSignature({ orderId, paymentId, signature, mockOutcome }) {
  if (!isLive()) {
    return mockOutcome === 'success';
  }
  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return timingSafeEqual(expected, signature);
}

/** Verify an inbound Razorpay webhook's `X-Razorpay-Signature` header. */
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!isLive() || !env.razorpay.webhookSecret) return true;
  const expected = crypto
    .createHmac('sha256', env.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');
  return timingSafeEqual(expected, signatureHeader);
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Fetch a payment's current state from the gateway - used to reconcile a
 * PENDING payment if our webhook/callback was ever missed.
 */
async function fetchPayment(gatewayPaymentId) {
  if (!isLive()) {
    return { mocked: true, id: gatewayPaymentId, status: 'captured' };
  }
  return getClient().payments.fetch(gatewayPaymentId);
}

/**
 * Refund a captured payment, in full or in part. Used by the admin panel's
 * payment management screen (e.g. after a doctor cancels a confirmed
 * appointment).
 */
async function refundPayment(gatewayPaymentId, { amountInPaise, notes = {} } = {}) {
  if (!isLive()) {
    return {
      mocked: true,
      id: `rfnd_mock_${crypto.randomBytes(8).toString('hex')}`,
      payment_id: gatewayPaymentId,
      amount: amountInPaise,
      status: 'processed',
      notes,
    };
  }
  const payload = { notes };
  if (amountInPaise) payload.amount = amountInPaise;
  return getClient().payments.refund(gatewayPaymentId, payload);
}

module.exports = {
  createOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  fetchPayment,
  refundPayment,
  isLive,
};
