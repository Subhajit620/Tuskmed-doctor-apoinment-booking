const prisma = require('../db/prisma');

/**
 * Shared promo-code evaluation used by both the live preview (Book
 * Appointment step 3) and the final booking commit, so the two can never
 * disagree about whether a code is valid/invalid/expired.
 */
async function evaluatePromo(code, baseAmount) {
  if (!code) {
    return { state: 'none', discountPct: 0, discountAmount: 0, finalAmount: baseAmount, promo: null };
  }
  const promo = await prisma.promoCode.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!promo || !promo.active) {
    return { state: 'invalid', discountPct: 0, discountAmount: 0, finalAmount: baseAmount, promo: null };
  }
  if (new Date(promo.expiry).getTime() < Date.now()) {
    return { state: 'expired', discountPct: 0, discountAmount: 0, finalAmount: baseAmount, promo: null };
  }
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
    return { state: 'expired', discountPct: 0, discountAmount: 0, finalAmount: baseAmount, promo: null };
  }
  const discountAmount = Math.round((Number(baseAmount) * promo.discountPct) / 100 * 100) / 100;
  const finalAmount = Math.max(0, Number(baseAmount) - discountAmount);
  return { state: 'valid', discountPct: promo.discountPct, discountAmount, finalAmount, promo };
}

module.exports = { evaluatePromo };
