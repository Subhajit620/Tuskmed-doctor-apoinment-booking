const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config();

// Ensure Node.js on AWS EC2 (which defaults to UTC) always uses Indian Standard Time (IST)
// for all date/time calculations and formatting across the backend.
process.env.TZ = process.env.TZ || 'Asia/Kolkata';

const { normalizeMobile } = require('../utils/mobile');

function bool(v, def) {
  if (v === undefined) return def;
  return String(v).toLowerCase() === 'true';
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  sessionCookieName: process.env.SESSION_COOKIE_NAME || 'tuskmed_session',
  // The one mobile number permanently reserved for the platform admin (see
  // prisma/seed.js). Guarded in two places: auth.js provisions it as ADMIN
  // on first login instead of the usual PATIENT default, and admin.js
  // refuses to onboard a doctor under this number (which would otherwise
  // silently downgrade the admin account's role).
  // Normalized regardless of how it's written in .env, so "8101421053" and
  // "+918101421053" are guaranteed to match the same canonical value.
  reservedAdminMobile: normalizeMobile(process.env.RESERVED_ADMIN_MOBILE || '8101421053'),
  // Global default, overridable per integration below (e.g. MOCK_WHATSAPP=false
  // to send real OTPs while payment/video/storage stay safely mocked).
  mockIntegrations: bool(process.env.MOCK_INTEGRATIONS, true),
  mock: {
    whatsapp: bool(process.env.MOCK_WHATSAPP, bool(process.env.MOCK_INTEGRATIONS, true)),
    payment: bool(process.env.MOCK_PAYMENT, bool(process.env.MOCK_INTEGRATIONS, true)),
    video: bool(process.env.MOCK_VIDEO, bool(process.env.MOCK_INTEGRATIONS, true)),
    storage: bool(process.env.MOCK_STORAGE, bool(process.env.MOCK_INTEGRATIONS, true)),
    genAi: bool(process.env.MOCK_GEN_AI, bool(process.env.MOCK_INTEGRATIONS, true)),
  },

  whatsapp: {
    provider: process.env.WHATSAPP_PROVIDER || (process.env.AISENSY_API_KEY ? 'aisensy' : 'meta_cloud_api'),
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v20.0',
    // Meta requires an approved template for the OTP send (free-form text
    // only works inside a 24h customer-service session). Create this once
    // in WhatsApp Manager > Message Templates, category "Authentication".
    otpTemplateName: process.env.WHATSAPP_OTP_TEMPLATE_NAME || 'otp_verification',
    otpTemplateLang: process.env.WHATSAPP_OTP_TEMPLATE_LANG || 'en',
  },
  // AiSensy - live WhatsApp provider for OTP and messaging
  aisensy: {
    apiKey: process.env.AISENSY_API_KEY || '',
    campaignName: process.env.AISENSY_CAMPAIGN_NAME || '',
    apptCampaignName: process.env.AISENSY_APPT_CAMPAIGN_NAME || '',
    doctorApptCampaignName: process.env.AISENSY_DOCTOR_APPT_CAMPAIGN_NAME || '',
    reminderCampaignName: process.env.AISENSY_REMINDER_CAMPAIGN_NAME || '',
    doctorReminderCampaignName: process.env.AISENSY_DOCTOR_REMINDER_CAMPAIGN_NAME || '',
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  daily: {
    apiKey: process.env.DAILY_API_KEY || '',
    domain: process.env.DAILY_DOMAIN || 'tuskmed.daily.co',
  },
  storage: {
    provider: process.env.STORAGE_PROVIDER || 's3',
    bucket: process.env.S3_BUCKET || 'tuskmed-uploads',
    region: process.env.S3_REGION || 'ap-south-1',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL || '',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
  },
  rules: {
    slotLockMinutes: parseInt(process.env.SLOT_LOCK_MINUTES || '10', 10),
    otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10),
    otpResendCooldownSeconds: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '30', 10),
    otpMaxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10),
    otpMaxResends: parseInt(process.env.OTP_MAX_RESENDS || '5', 10),
    joinCallWindowMinutesBefore: parseInt(process.env.JOIN_CALL_WINDOW_MINUTES_BEFORE || '15', 10),
    joinCallWindowMinutesAfter: parseInt(process.env.JOIN_CALL_WINDOW_MINUTES_AFTER || '120', 10), // 2 hours max joining window
    maxUploadBytes: 4 * 1024 * 1024, // <4MB
  },
};
