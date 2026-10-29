const prisma = require('../db/prisma');
const { formatMeetingUrl } = require('../integrations/whatsapp');
const { broadcastConsultationEvent } = require('../realtime/io');

function cleanDoctorName(name) {
  if (!name) return 'Doctor';
  return String(name).replace(/^Dr\.?\s*/i, '').trim();
}

function formatDateTime(start) {
  const d = new Date(start);
  const dateStr = d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  const timeStr = d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
  return { dateStr, timeStr };
}

/**
 * Ensures that upon booking confirmation, the appointment's in-app Message Box
 * contains the confirmation message and Video Joining Link for both Patient and Doctor
 * (with different, role-specific messages for each).
 */
async function ensureBookingConfirmationMessages({
  appointmentId,
  doctorName,
  patientName,
  start,
  mode = 'VIDEO',
  meetingUrl,
}) {
  if (!appointmentId || !start) return;

  const existing = await prisma.message.findFirst({
    where: {
      appointmentId,
      senderId: { in: ['SYSTEM_PATIENT', 'SYSTEM_DOCTOR'] },
      body: { contains: 'Booking Confirmed' },
    },
  });
  if (existing) return;

  const doc = cleanDoctorName(doctorName);
  const patient = String(patientName || 'Patient').trim();
  const { dateStr, timeStr } = formatDateTime(start);
  const isVideo = mode === 'VIDEO';
  const joinUrl = isVideo ? formatMeetingUrl(meetingUrl, appointmentId) : '';
  const doctorJoinUrl = joinUrl ? `${joinUrl}${joinUrl.includes('?') ? '&' : '?'}role=DOCTOR` : '';

  const patientBody = isVideo
    ? `✅ Booking Confirmed!\nHi ${patient}, your Video Consultation with Dr. ${doc} is confirmed for ${dateStr} at ${timeStr}.\n\n🎥 Video Joining Link: ${joinUrl}\n(Click the button or link above to join your video consultation room 15 minutes before the scheduled time.)`
    : `✅ Booking Confirmed!\nHi ${patient}, your In-Clinic Visit with Dr. ${doc} is confirmed for ${dateStr} at ${timeStr}.`;

  const doctorBody = isVideo
    ? `✅ Booking Confirmed!\nHello Dr. ${doc}, your Video Consultation with patient ${patient} is scheduled for ${dateStr} at ${timeStr}.\n\n🎥 Video Joining Link: ${doctorJoinUrl}\n(Click the button or link above to open the consultation room.)`
    : `✅ Booking Confirmed!\nHello Dr. ${doc}, your In-Clinic Visit with patient ${patient} is scheduled for ${dateStr} at ${timeStr}.`;

  await prisma.message.createMany({
    data: [
      {
        appointmentId,
        senderRole: 'DOCTOR',
        senderId: 'SYSTEM_PATIENT',
        body: patientBody,
      },
      {
        appointmentId,
        senderRole: 'PATIENT',
        senderId: 'SYSTEM_DOCTOR',
        body: doctorBody,
      },
    ],
  });
}

/**
 * Posts separate, role-specific reminder messages into the in-app Message Box
 * for both the Patient and the Doctor when the appointment reminder triggers.
 */
async function createReminderBoxMessages({
  appointmentId,
  doctorName,
  patientName,
  start,
  mode = 'VIDEO',
  meetingUrl,
}) {
  if (!appointmentId || !start) return;

  const doc = cleanDoctorName(doctorName);
  const patient = String(patientName || 'Patient').trim();
  const { dateStr, timeStr } = formatDateTime(start);
  const isVideo = mode === 'VIDEO';
  const joinUrl = isVideo ? formatMeetingUrl(meetingUrl, appointmentId) : '';
  const doctorJoinUrl = joinUrl ? `${joinUrl}${joinUrl.includes('?') ? '&' : '?'}role=DOCTOR` : '';

  const patientReminderBody = isVideo
    ? `⏰ Appointment Reminder!\nHi ${patient}, your Video Consultation with Dr. ${doc} starts in 15 minutes (${dateStr} at ${timeStr}).\n\n🎥 Join Video Call Now: ${joinUrl}`
    : `⏰ Appointment Reminder!\nHi ${patient}, your In-Clinic Visit with Dr. ${doc} is scheduled at ${timeStr} today (${dateStr}).`;

  const doctorReminderBody = isVideo
    ? `⏰ Consultation Reminder!\nHello Dr. ${doc}, your Video Consultation with patient ${patient} starts in 15 minutes (${dateStr} at ${timeStr}).\n\n🎥 Join Consultation Room: ${doctorJoinUrl}`
    : `⏰ Consultation Reminder!\nHello Dr. ${doc}, your In-Clinic Visit with patient ${patient} is scheduled at ${timeStr} today (${dateStr}).`;

  const [patientMsg, doctorMsg] = await prisma.$transaction([
    prisma.message.create({
      data: {
        appointmentId,
        senderRole: 'DOCTOR',
        senderId: 'SYSTEM_PATIENT',
        body: patientReminderBody,
      },
    }),
    prisma.message.create({
      data: {
        appointmentId,
        senderRole: 'PATIENT',
        senderId: 'SYSTEM_DOCTOR',
        body: doctorReminderBody,
      },
    }),
  ]);

  try {
    broadcastConsultationEvent(appointmentId, 'consultation:chat', patientMsg);
    broadcastConsultationEvent(appointmentId, 'consultation:chat', doctorMsg);
  } catch {
    // ignore socket errors
  }
}

module.exports = {
  ensureBookingConfirmationMessages,
  createReminderBoxMessages,
};
