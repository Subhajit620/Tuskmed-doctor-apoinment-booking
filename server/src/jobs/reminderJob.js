const prisma = require('../db/prisma');
const { sendPatientReminder, sendDoctorReminder } = require('../integrations/whatsapp');
const { createReminderBoxMessages } = require('../utils/appointmentMessages');
const { audit } = require('../utils/audit');

const REMINDER_WINDOW_MINUTES = 15; // send once an appointment is within this window

/** Pull a usable mobile number off a doctor record, whatever the field is called. */
function doctorMobile(doctor) {
  if (!doctor) return null;
  return (
    doctor.account?.mobile ||
    doctor.mobile ||
    doctor.phone ||
    doctor.contactNumber ||
    null
  );
}

/** Same idea for the patient record. */
function patientMobile(patient) {
  if (!patient) return null;
  return (
    patient.mobile ||
    patient.account?.mobile ||
    patient.phone ||
    patient.contactNumber ||
    null
  );
}

/**
 * WhatsApp + Message Box reminders before the appointment. Runs on a short
 * interval and sends (at most once, tracked via `reminderSentAt`) DIFFERENT,
 * role-specific reminders to BOTH the doctor and the patient of any CONFIRMED
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
    include: {
      slot: true,
      doctor: { include: { account: true } },
      patient: { include: { account: true } },
    },
  });

  for (const appt of due) {
    const sentTo = [];
    try {
      const payload = {
        appointmentId: appt.id,
        doctorName: appt.doctor?.name,
        patientName: appt.patient?.name,
        start: appt.slot.start,
        mode: appt.mode,
        meetingUrl: appt.videoLink,
      };

      // 1. Post separate Doctor & Patient reminder messages (with Video Joining Link) into in-app Message Box
      try {
        // eslint-disable-next-line no-await-in-loop
        await createReminderBoxMessages(payload);
        sentTo.push('MESSAGE_BOX');
      } catch (msgErr) {
        console.error(
          `[reminderJob] appointment ${appt.id}: message box reminder failed:`,
          msgErr.message
        );
      }

      // 2. Send Doctor-specific WhatsApp reminder (mentions Patient name, date, time)
      const docTo = doctorMobile(appt.doctor);
      if (!docTo) {
        console.warn(
          `[reminderJob] appointment ${appt.id}: doctor ${appt.doctor?.id || '?'} has no mobile, skipping`
        );
      } else {
        try {
          // eslint-disable-next-line no-await-in-loop
          await sendDoctorReminder(docTo, payload);
          sentTo.push('DOCTOR');
          console.log(`[reminderJob] appointment ${appt.id}: doctor reminder sent to ${docTo}`);
        } catch (docErr) {
          console.error(
            `[reminderJob] appointment ${appt.id}: doctor reminder failed:`,
            docErr.message
          );
        }
      }

      // 3. Send Patient-specific WhatsApp reminder (mentions Doctor name, date, time)
      const patTo = patientMobile(appt.patient);
      if (!patTo) {
        console.warn(
          `[reminderJob] appointment ${appt.id}: patient ${appt.patient?.id || '?'} has no mobile, skipping`
        );
      } else {
        try {
          // eslint-disable-next-line no-await-in-loop
          await sendPatientReminder(patTo, payload);
          sentTo.push('PATIENT');
          console.log(`[reminderJob] appointment ${appt.id}: patient reminder sent to ${patTo}`);
        } catch (patErr) {
          console.error(
            `[reminderJob] appointment ${appt.id}: patient reminder failed:`,
            patErr.message
          );
        }
      }

      // eslint-disable-next-line no-await-in-loop
      await prisma.appointment.update({
        where: { id: appt.id },
        data: { reminderSentAt: new Date() },
      });

      if (appt.patient?.account?.id) {
        // eslint-disable-next-line no-await-in-loop
        await audit(appt.patient.account.id, 'APPOINTMENT_REMINDER_SENT', {
          appointmentId: appt.id,
          sentTo: sentTo.join(',') || 'NONE',
        });
      }
    } catch (err) {
      // one bad appointment must not stall the batch or retry every 60s forever
      console.error(`[reminderJob] appointment ${appt.id} failed:`, err.message);
    }
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
