const prisma = require('../db/prisma');

/**
 * Append-only audit trail for logins, bookings, payments, and record access,
 * per the non-functional logging requirement. Never throws - a logging
 * failure must not break the request it is observing.
 */
async function audit(accountId, action, meta = {}) {
  try {
    await prisma.auditLog.create({
      data: { accountId: accountId || null, action, meta },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit] failed to write log', action, err.message);
  }
}

module.exports = { audit };
