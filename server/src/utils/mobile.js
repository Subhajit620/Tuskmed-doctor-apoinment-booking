/**
 * Canonical mobile number format used for account identity (lookup and
 * creation): "+91XXXXXXXXXX" - matching the convention already used
 * everywhere else in this app (the login placeholder, every seeded doctor
 * and patient). A bare 10-digit input gets India's country code and a
 * leading '+'; anything already carrying a country code just gets a
 * leading '+' if it's missing.
 *
 * Without this, "8101421053" and "+918101421053" were treated as two
 * completely different accounts, since Account.mobile was looked up/stored
 * exactly as typed. That's what let the reserved admin number split into
 * two accounts (one ADMIN, one accidentally PATIENT) - see auth.js, which
 * now normalizes before every account lookup/creation, and admin.js's
 * reserved-mobile check, which compares normalized values on both sides.
 *
 * Note: this is deliberately a *different* canonical form from
 * integrations/aisensy.js's toAiSensyRecipient() (which strips the '+' -
 * that's what the AiSensy/Meta APIs want on the wire). Account identity and
 * "the shape a WhatsApp API call needs" are separate concerns; each
 * integration still normalizes again at send time regardless of how the
 * number is stored here.
 */
function normalizeMobile(input) {
  const digits = String(input || '').replace(/[^\d]/g, '');
  if (!digits) return String(input || '').trim();
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

/**
 * True if this looks like a real mobile number once formatting is
 * stripped - spaces, dashes, parens, a leading '+', all fine. Validate
 * with this (not a raw regex on the untouched input) before normalizing:
 * a naturally-typed number like "+91 88888 88888" or "8888-888-888" is
 * exactly the kind of input a real user types, and rejecting it before
 * normalization ever runs is what caused a doctor's own number to fail
 * login with "a valid mobile number is required" after being onboarded
 * with the same number typed slightly differently.
 */
function isValidMobile(input) {
  const digits = String(input || '').replace(/[^\d]/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

module.exports = { normalizeMobile, isValidMobile };
