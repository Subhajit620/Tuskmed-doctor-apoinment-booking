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

function formatMeetingUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const origin = (env.clientOrigin || 'http://localhost:5173').replace(/\/$/, '');
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

function cleanDoctorName(name) {
  if (!name) return 'Doctor';
  return name.replace(/^Dr\.?\s*/i, '');
}

async function sendVideoConsultationConfirmed(mobile, { patientName, doctorName, start, meetingUrl }) {
  const dateStr = new Date(start).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = new Date(start).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const fullMeetingUrl = formatMeetingUrl(meetingUrl);
  const doc = cleanDoctorName(doctorName);

  // templateParams must match the approved tuskmed_appointment_confirmation template:
  // Hi {{1}}, your appointment with Dr. {{2}} has been confirmed.
  // 📅 Date: {{3}}
  // 🕐 Time: {{4}}
  // 🔗 Join your consultation: {{5}}
  return sendWhatsAppMessage(mobile, '', {
    userName: patientName || 'Patient',
    campaignName: env.aisensy.apptCampaignName,
    templateParams: [
      patientName || 'Patient',  // {{1}} - patient name
      doc,                        // {{2}} - doctor name (without Dr. prefix)
      dateStr,                    // {{3}} - formatted date
      timeStr,                    // {{4}} - formatted time
      fullMeetingUrl,             // {{5}} - consultation link
    ],
  });
}

async function sendAppointmentConfirmation(mobile, {
  doctorName,
  start,
  mode,
  patientName,
  meetingUrl,
}) {
  const patient = patientName || 'Patient';
  const doc = cleanDoctorName(doctorName);

  // The approved patient template expects a consultation URL in {{5}}.
  // Do not send for in-clinic appointments — there is no meeting URL.
  if (mode !== 'VIDEO' || !meetingUrl) {
    console.warn(
      '[whatsapp] Patient confirmation skipped: approved template requires a video consultation URL.'
    );
    return {
      skipped: true,
      reason: 'Patient template requires a video consultation URL',
    };
  }

  return sendVideoConsultationConfirmed(mobile, {
    patientName: patient,
    doctorName: doc,
    start,
    meetingUrl,
  });
}

async function sendDoctorAppointmentNotification(mobile, { doctorName, patientName, start, mode, meetingUrl }) {
  const dateStr = new Date(start).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = new Date(start).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const fullMeetingUrl = formatMeetingUrl(meetingUrl);
  const doc = cleanDoctorName(doctorName);
  const appointmentInfo = mode === 'VIDEO' ? 'Video Consultation' : 'In-Clinic Appointment';

  // templateParams must match the approved tuskmed_doctor_appointment template.
  // Verify your doctor template variable count in AiSensy matches these 5 params.
  return sendWhatsAppMessage(mobile, '', {
    userName: `Dr. ${doc}`,
    campaignName: env.aisensy.doctorApptCampaignName,
    templateParams: [
      `Dr. ${doc}`,             // {{1}} - doctor name
      patientName || 'Patient', // {{2}} - patient name
      dateStr,                  // {{3}} - formatted date
      timeStr,                  // {{4}} - formatted time
      appointmentInfo,          // {{5}} - Video Consultation or In-Clinic Appointment
    ],
  });
}

async function sendReminder(mobile, { doctorName, start }) {
  const campaignName = env.aisensy.reminderCampaignName;

  if (!campaignName) {
    throw new Error(
      'WhatsApp reminder not sent: AISENSY_REMINDER_CAMPAIGN_NAME is not configured.'
    );
  }

  const date = new Date(start);

  if (Number.isNaN(date.getTime())) {
    throw new Error('WhatsApp reminder not sent: invalid appointment date.');
  }

  const doctor = String(doctorName || 'Doctor').replace(/^Dr\.?\s*/i, '').trim();
  const dateStr = date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return sendWhatsAppMessage(mobile, '', {
    campaignName,
    userName: 'TuskMed Patient',
    templateParams: [doctor, dateStr, timeStr],
  });
}

module.exports = {
  sendOtp,
  sendAppointmentConfirmation,
  sendVideoConsultationConfirmed,
  sendDoctorAppointmentNotification,
  sendReminder,
  _outbox: outbox,
};
