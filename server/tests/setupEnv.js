// Loaded before each test file. Forces safe, deterministic settings
// regardless of what a developer's local .env happens to contain.
process.env.NODE_ENV = 'test';
process.env.MOCK_INTEGRATIONS = 'true';
// Force every per-integration override too - a developer's real .env may
// set e.g. MOCK_WHATSAPP=false to send live OTPs from the dev server, and
// dotenv (below) won't clobber an already-set process.env var. Without this,
// tests would silently attempt real provider calls and lose access to
// devCode (which only ever appears when WhatsApp itself is mocked).
process.env.MOCK_WHATSAPP = 'true';
process.env.MOCK_PAYMENT = 'true';
process.env.MOCK_VIDEO = 'true';
process.env.MOCK_STORAGE = 'true';
process.env.MOCK_GEN_AI = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.OTP_RESEND_COOLDOWN_SECONDS = '0';
require('dotenv').config();

// Critical: redirect Prisma at a SEPARATE database for the test run. Without
// this, `npm test` would create/mutate real rows in the same database your
// dev server and seed data use - which is exactly what happened during
// development here (accumulating junk "Dr. Test" doctors in the demo DB).
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  // eslint-disable-next-line no-console
  console.warn(
    '[tests] TEST_DATABASE_URL is not set - falling back to DATABASE_URL. ' +
      'Tests will write into your dev database. Set TEST_DATABASE_URL in .env to avoid this.'
  );
}
