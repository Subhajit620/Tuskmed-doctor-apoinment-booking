const prisma = require('../db/prisma');
const { sendReminder } = require('../integrations/whatsapp');
const { audit } = require('../utils/audit');

const REMINDER_WINDOW_MINUTES = 60; // send once an appointment is within this window

/**
 * WhatsApp reminders before the appointment. Runs on a short interval and
 * sends (at most once, tracked via `reminderSentAt`) to any CONFIRMED
 * appointment whose slot starts within the reminder window.
 */
async function sendDueReminders() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MINUTES * 60 * 1000);

  const due = await prisma.appointment.findMany({
    where: {
      status: 'CONFIRMED',
      reminderSentAt: null,
      slot: { start: { gte: now, lte: windowEnd } },
    },
    include: { slot: true, doctor: true, patient: { include: { account: true } } },
  });

  for (const appt of due) {
    // eslint-disable-next-line no-await-in-loop
    await sendReminder(appt.patient.account.mobile, { doctorName: appt.doctor.name, start: appt.slot.start });
    // eslint-disable-next-line no-await-in-loop
    await prisma.appointment.update({ where: { id: appt.id }, data: { reminderSentAt: new Date() } });
    // eslint-disable-next-line no-await-in-loop
    await audit(appt.patient.account.id, 'APPOINTMENT_REMINDER_SENT', { appointmentId: appt.id });
  }
}

function startReminderJob(intervalMs = 60 * 1000) {
  const handle = setInterval(() => {
    sendDueReminders().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[reminderJob] failed', err);
    });
  }, intervalMs);
  handle.unref?.();
  return handle;
}

module.exports = { startReminderJob, sendDueReminders };
