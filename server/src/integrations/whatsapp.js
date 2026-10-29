const env = require('../config/env');
const aisensy = require('./aisensy');

/**
 * Unified WhatsApp Business messaging integration.
 * Supports AiSensy (primary) and Meta WhatsApp Cloud API.
 * In mock mode (default, no credentials required) messages are logged
 * to outbox so dev and tests run cleanly without network calls.
 */

const outbox = []; // in-memory log, handy for tests/dev inspection

function graphUrl() {
  return `https://graph.facebook.com/${env.whatsapp.apiVersion}/${env.whatsapp.phoneNumberId}/messages`;
}

function toGraphRecipient(mobile) {
  const digits = String(mobile || '').replace(/[^\d]/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

async function postToGraph(payload) {
  const res = await fetch(graphUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.whatsapp.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`WhatsApp send failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function sendWhatsAppMessage(mobile, body, options = {}) {
  const isAiSensy = env.whatsapp.provider === 'aisensy' || Boolean(env.aisensy.apiKey);

  if (isAiSensy) {
    const campaignName = options.campaignName || env.aisensy.apptCampaignName;
    const templateParams = options.templateParams || [body];
    const userName = options.userName || 'TuskMed User';

    if (env.mock.whatsapp) {
      outbox.push({
        mobile,
        body,
        options,
        at: new Date().toISOString(),
      });
      console.log(`[whatsapp:aisensy:mock] -> ${mobile}: ${body}`);
      return {
        mocked: true,
        provider: 'aisensy',
        id: `mock_${Date.now()}`,
      };
    }

    if (!env.aisensy.apiKey) {
      throw new Error(
        'AiSensy live sending is enabled, but AISENSY_API_KEY is missing.'
      );
    }

    if (!campaignName) {
      throw new Error(
        'AiSensy live sending is enabled, but the campaign name is missing.'
      );
    }

    try {
      return await aisensy.sendCampaignMessage(mobile, {
        campaignName,
        userName,
        templateParams,
        buttons: options.buttons || [],
      });
    } catch (err) {
      console.error('[whatsapp:aisensy] Live message send failed:', err.message);
      throw err;
    }
  }

  // Meta Cloud API path
  if (env.mock.whatsapp || !env.whatsapp.token) {
    outbox.push({ mobile, body, at: new Date().toISOString() });
    console.log(`[whatsapp:mock] -> ${mobile}: ${body}`);
    return { mocked: true, id: `mock_${Date.now()}` };
  }

  try {
    return await postToGraph({
      messaging_product: 'whatsapp',
      to: toGraphRecipient(mobile),
      type: 'text',
      text: { body },
    });
  } catch (err) {
    console.warn('[whatsapp] Real WhatsApp delivery failed (token may be expired):', err.message);
    outbox.push({ mobile, body, at: new Date().toISOString(), error: err.message });
    console.log(`[whatsapp:fallback] -> ${mobile}: ${body}`);
    return { mocked: true, fallback: true, id: `mock_${Date.now()}` };
  }
}

async function sendOtp(mobile, code) {
  const isAiSensy = env.whatsapp.provider === 'aisensy' || Boolean(env.aisensy.apiKey);

  if (isAiSensy) {
    return aisensy.sendOtp(mobile, code);
  }

  if (env.mock.whatsapp || !env.whatsapp.token) {
    outbox.push({ mobile, body: `[otp template] code=${code}`, at: new Date().toISOString() });
    console.log(`[whatsapp:mock] -> ${mobile}: your TuskMed code is ${code}`);
    return { mocked: true, id: `mock_${Date.now()}` };
  }

  try {
    return await postToGraph({
      messaging_product: 'whatsapp',
      to: toGraphRecipient(mobile),
      type: 'template',
      template: {
        name: env.whatsapp.otpTemplateName,
        language: { code: env.whatsapp.otpTemplateLang },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: code }],
          },
        ],
      },
    });
  } catch (err) {
    console.warn('[whatsapp] Real OTP send failed (token may be expired):', err.message);
    outbox.push({ mobile, body: `[otp template] code=${code}`, at: new Date().toISOString(), error: err.message });
    console.log(`[whatsapp:fallback] -> ${mobile}: your TuskMed code is ${code}`);
    return { mocked: true, fallback: true, id: `mock_${Date.now()}` };
  }
}

function formatMeetingUrl(url, appointmentId) {
  const origin = (env.clientOrigin || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '');
  if ((!url || (url.includes('tuskmed.daily.co') && (env.mock.video || !env.daily?.apiKey))) && appointmentId) {
    return `${origin}/consultation/${appointmentId}`;
  }
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

function cleanDoctorName(name) {
  if (!name) return 'Doctor';
  return name.replace(/^Dr\.?\s*/i, '').trim();
}

function formatIstDateTime(start) {
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

async function sendVideoConsultationConfirmed(mobile, { appointmentId, patientName, doctorName, start, meetingUrl }) {
  const { dateStr, timeStr } = formatIstDateTime(start);
  const fullMeetingUrl = formatMeetingUrl(meetingUrl, appointmentId);
  const doc = cleanDoctorName(doctorName);
  const patient = patientName || 'Patient';
  const body = `Hi ${patient}, your video consultation with Dr. ${doc} is confirmed for ${dateStr} at ${timeStr}. Join here: ${fullMeetingUrl}`;

  // templateParams must match the approved tuskmed_appointment_confirmation template:
  // Hi {{1}}, your appointment with Dr. {{2}} has been confirmed.
  // 📅 Date: {{3}}
  // 🕐 Time: {{4}}
  // 🔗 Join your consultation: {{5}}
  return sendWhatsAppMessage(mobile, body, {
    userName: patient,
    campaignName: env.aisensy.apptCampaignName,
    templateParams: [
      patient,        // {{1}} - patient name
      doc,            // {{2}} - doctor name (without Dr. prefix)
      dateStr,        // {{3}} - formatted date
      timeStr,        // {{4}} - formatted time
      fullMeetingUrl, // {{5}} - consultation link
    ],
  });
}

async function sendAppointmentConfirmation(mobile, {
  appointmentId,
  doctorName,
  start,
  mode,
  patientName,
  meetingUrl,
}) {
  const patient = patientName || 'Patient';
  const doc = cleanDoctorName(doctorName);
  const resolvedUrl = formatMeetingUrl(meetingUrl, mode === 'VIDEO' ? appointmentId : null);

  // The approved patient template expects a consultation URL in {{5}}.
  // Do not send for in-clinic appointments — there is no meeting URL.
  if (mode !== 'VIDEO' || !resolvedUrl) {
    console.warn(
      '[whatsapp] Patient confirmation skipped: approved template requires a video consultation URL.'
    );
    return {
      skipped: true,
      reason: 'Patient template requires a video consultation URL',
    };
  }

  return sendVideoConsultationConfirmed(mobile, {
    appointmentId,
    patientName: patient,
    doctorName: doc,
    start,
    meetingUrl: resolvedUrl,
  });
}

async function sendDoctorAppointmentNotification(mobile, { appointmentId, doctorName, patientName, start, mode, meetingUrl }) {
  const { dateStr, timeStr } = formatIstDateTime(start);
  const rawUrl = formatMeetingUrl(meetingUrl, mode === 'VIDEO' ? appointmentId : null);
  const fullMeetingUrl = rawUrl ? `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}role=DOCTOR` : '';
  const doc = cleanDoctorName(doctorName);
  const patient = patientName || 'Patient';
  const appointmentInfo = mode === 'VIDEO' ? 'Video Consultation' : 'In-Clinic Appointment';
  const body = `Hello Dr. ${doc}, new ${appointmentInfo} booked with patient ${patient} on ${dateStr} at ${timeStr}.${fullMeetingUrl ? ` Join link: ${fullMeetingUrl}` : ''}`;

  // templateParams must match the approved tuskmed_doctor_appointment template.
  return sendWhatsAppMessage(mobile, body, {
    userName: `Dr. ${doc}`,
    campaignName: env.aisensy.doctorApptCampaignName,
    templateParams: [
      `Dr. ${doc}`,   // {{1}} - doctor name
      patient,        // {{2}} - patient name
      dateStr,        // {{3}} - formatted date
      timeStr,        // {{4}} - formatted time
      appointmentInfo,// {{5}} - Video Consultation or In-Clinic Appointment
    ],
  });
}

/**
 * Patient Reminder — tailored specifically for the Patient:
 * Reminds the patient about their upcoming consultation with Dr. <DoctorName>.
 */
async function sendPatientReminder(mobile, { appointmentId, patientName, doctorName, start, mode = 'VIDEO', meetingUrl }) {
  const campaignName = env.aisensy.reminderCampaignName;

  if (!campaignName && !env.mock.whatsapp) {
    throw new Error(
      'WhatsApp patient reminder not sent: AISENSY_REMINDER_CAMPAIGN_NAME is not configured.'
    );
  }

  const date = new Date(start);
  if (Number.isNaN(date.getTime())) {
    throw new Error('WhatsApp patient reminder not sent: invalid appointment date.');
  }

  const doctor = cleanDoctorName(doctorName);
  const patient = String(patientName || 'Patient').trim();
  const { dateStr, timeStr } = formatIstDateTime(date);
  const fullMeetingUrl = formatMeetingUrl(meetingUrl, mode === 'VIDEO' ? appointmentId : null);
  const body = `⏰ Reminder for ${patient}: Your ${mode === 'VIDEO' ? 'Video Consultation' : 'In-Clinic Visit'} with Dr. ${doctor} starts soon on ${dateStr} at ${timeStr}.${fullMeetingUrl ? ` Join here: ${fullMeetingUrl}` : ''}`;

  return sendWhatsAppMessage(mobile, body, {
    campaignName: campaignName || 'Appoinment-reminder',
    userName: patient || 'TuskMed Patient',
    templateParams: [doctor, dateStr, timeStr],
  });
}

/**
 * Doctor Reminder — tailored specifically for the Doctor (different from Patient reminder):
 * Reminds Dr. <DoctorName> about their upcoming consultation with Patient <PatientName>.
 */
async function sendDoctorReminder(mobile, { appointmentId, doctorName, patientName, start, mode = 'VIDEO', meetingUrl }) {
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) {
    throw new Error('WhatsApp doctor reminder not sent: invalid appointment date.');
  }

  const doctor = cleanDoctorName(doctorName);
  const patient = String(patientName || 'Patient').trim();
  const { dateStr, timeStr } = formatIstDateTime(date);
  const rawUrl = formatMeetingUrl(meetingUrl, mode === 'VIDEO' ? appointmentId : null);
  const fullMeetingUrl = rawUrl ? `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}role=DOCTOR` : '';
  const appointmentInfo = mode === 'VIDEO' ? 'Video Consultation' : 'In-Clinic Appointment';
  const body = `⏰ Doctor Reminder: Hello Dr. ${doctor}, your ${appointmentInfo} with patient ${patient} is starting soon on ${dateStr} at ${timeStr}.${fullMeetingUrl ? ` Join room: ${fullMeetingUrl}` : ''}`;

  const doctorReminderCampaign = env.aisensy.doctorReminderCampaignName;
  const fallbackDoctorCampaign = env.aisensy.doctorApptCampaignName;
  const fallbackReminderCampaign = env.aisensy.reminderCampaignName;
  const campaignName = doctorReminderCampaign || fallbackDoctorCampaign || fallbackReminderCampaign;

  if (!campaignName && !env.mock.whatsapp) {
    throw new Error(
      'WhatsApp doctor reminder not sent: no AiSensy doctor reminder campaign configured.'
    );
  }

  // If a dedicated AISENSY_DOCTOR_REMINDER_CAMPAIGN_NAME is configured, try 3-param, 4-param, or 5-param doctor formats
  if (doctorReminderCampaign) {
    const paramCandidates = [
      [`Dr. ${doctor}`, patient, dateStr, timeStr],
      [patient, dateStr, timeStr],
      [`Dr. ${doctor}`, patient, dateStr, timeStr, fullMeetingUrl || appointmentInfo],
    ];
    let lastErr;
    for (const templateParams of paramCandidates) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await sendWhatsAppMessage(mobile, body, {
          campaignName: doctorReminderCampaign,
          userName: `Dr. ${doctor}`,
          templateParams,
        });
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  // Fallback 1: Use the approved 5-param Doctor Appointment campaign if available
  if (fallbackDoctorCampaign) {
    return sendWhatsAppMessage(mobile, body, {
      campaignName: fallbackDoctorCampaign,
      userName: `Dr. ${doctor}`,
      templateParams: [
        `Dr. ${doctor}`,
        patient,
        dateStr,
        timeStr,
        `Upcoming Reminder (${appointmentInfo})`,
      ],
    });
  }

  // Fallback 2: Use the 3-param reminder campaign but pass Patient Name so the doctor sees who they are meeting
  return sendWhatsAppMessage(mobile, body, {
    campaignName: fallbackReminderCampaign || 'Doctor-Appoinment-reminder',
    userName: `Dr. ${doctor}`,
    templateParams: [`Patient ${patient}`, dateStr, timeStr],
  });
}

// Keep sendReminder as an alias to sendPatientReminder for backward compatibility
const sendReminder = sendPatientReminder;

module.exports = {
  formatMeetingUrl,
  sendOtp,
  sendAppointmentConfirmation,
  sendVideoConsultationConfirmed,
  sendDoctorAppointmentNotification,
  sendReminder,
  sendPatientReminder,
  sendDoctorReminder,
  _outbox: outbox,
};

