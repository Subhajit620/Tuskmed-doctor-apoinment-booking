const prisma = require('../db/prisma');
const { broadcastSlotChange } = require('../realtime/io');
const { audit } = require('../utils/audit');

/**
 * Releases slots whose lock has timed out without a completed payment -
 * this is what makes "released only if payment fails or times out" true
 * even if the patient's browser just closes mid-checkout.
 */
async function sweepExpiredLocks() {
  const stalePending = await prisma.appointment.findMany({
    where: { status: 'PENDING_PAYMENT', slot: { status: 'LOCKED', lockExpiresAt: { lt: new Date() } } },
    include: { slot: true },
  });

  for (const appt of stalePending) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.$transaction([
      prisma.slot.update({ where: { id: appt.slotId }, data: { status: 'AVAILABLE', lockedAt: null, lockExpiresAt: null } }),
      prisma.appointment.update({ where: { id: appt.id }, data: { status: 'CANCELLED' } }),
      prisma.payment.updateMany({ where: { appointmentId: appt.id, status: 'CREATED' }, data: { status: 'FAILED' } }),
    ]);
    broadcastSlotChange(appt.slot.doctorId, appt.slot.start, { slotId: appt.slotId, status: 'AVAILABLE' });
    // eslint-disable-next-line no-await-in-loop
    await audit(null, 'SLOT_LOCK_EXPIRED', { slotId: appt.slotId, appointmentId: appt.id });
  }
}

function startSlotSweeper(intervalMs = 30 * 1000) {
  const handle = setInterval(() => {
    sweepExpiredLocks().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[slotSweeper] failed', err);
    });
  }, intervalMs);
  handle.unref?.();
  return handle;
}

module.exports = { startSlotSweeper, sweepExpiredLocks };
