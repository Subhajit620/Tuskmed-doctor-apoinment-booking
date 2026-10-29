const crypto = require('crypto');
const request = require('supertest');
const { createApp } = require('../src/app');
const prisma = require('../src/db/prisma');

const app = createApp();

function uniqueMobile() {
  // +91 9 + 9 random digits = valid 10-digit-after-country-code mobile.
  const digits = crypto.randomInt(100000000, 999999999);
  return `+919${digits}`;
}

/** Logs a fresh patient account in via the real OTP flow and returns a cookie-persisting agent. */
async function loginAsNewPatient() {
  const agent = request.agent(app);
  const mobile = uniqueMobile();

  const reqRes = await agent.post('/api/auth/otp/request').send({ mobile });
  if (reqRes.status !== 200) throw new Error(`otp/request failed: ${JSON.stringify(reqRes.body)}`);
  const { otpId, devCode } = reqRes.body;

  const verifyRes = await agent.post('/api/auth/otp/verify').send({ otpId, code: devCode });
  if (verifyRes.status !== 200) throw new Error(`otp/verify failed: ${JSON.stringify(verifyRes.body)}`);

  await agent.post('/api/auth/accept-policy').send();

  return { agent, mobile, account: verifyRes.body.account };
}

async function makeSpecialityAndDoctor(overrides = {}) {
  const speciality = await prisma.speciality.create({
    data: { name: `Test Speciality ${crypto.randomUUID()}`, keywords: [] },
  });
  const doctor = await prisma.doctor.create({
    data: {
      specialityId: speciality.id,
      name: 'Dr. Test',
      fee: 500,
      ...overrides,
    },
  });
  return { speciality, doctor };
}

async function makeFutureSlot(doctorId, { mode = 'VIDEO', hoursFromNow = 48 } = {}) {
  const start = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return prisma.slot.create({ data: { doctorId, start, end, mode } });
}

async function registerPatientProfile(agent, overrides = {}) {
  const res = await agent.post('/api/patients').send({
    name: 'Test Patient',
    dob: '1990-01-01',
    gender: 'OTHER',
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`patient registration failed: ${JSON.stringify(res.body)}`);
  return res.body.patient;
}

module.exports = {
  app,
  prisma,
  uniqueMobile,
  loginAsNewPatient,
  makeSpecialityAndDoctor,
  makeFutureSlot,
  registerPatientProfile,
};
