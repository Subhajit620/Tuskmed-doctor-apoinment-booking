const bcrypt = require('bcryptjs');
const crypto = require('crypto');

function generateOtp() {
  // 6-digit numeric code, zero-padded.
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

async function hashOtp(code) {
  return bcrypt.hash(code, 8);
}

async function compareOtp(code, hash) {
  return bcrypt.compare(code, hash);
}

function generateTicketReference() {
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TM-${rand}`;
}

module.exports = { generateOtp, hashOtp, compareOtp, generateTicketReference };
