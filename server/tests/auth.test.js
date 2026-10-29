const request = require('supertest');
const { app, prisma, uniqueMobile, makeSpecialityAndDoctor } = require('./helpers');

describe('OTP login', () => {
  test('full happy path: request -> verify -> session -> /me', async () => {
    const agent = request.agent(app);
    const mobile = uniqueMobile();

    const reqRes = await agent.post('/api/auth/otp/request').send({ mobile });
    expect(reqRes.status).toBe(200);
    expect(reqRes.body.otpId).toBeTruthy();
    expect(reqRes.body.devCode).toMatch(/^\d{6}$/);

    const verifyRes = await agent.post('/api/auth/otp/verify').send({ otpId: reqRes.body.otpId, code: reqRes.body.devCode });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.account.mobile).toBe(mobile);
    expect(verifyRes.body.account.role).toBe('PATIENT');
    expect(verifyRes.body.needsPolicyAcceptance).toBe(true);

    const meRes = await agent.get('/api/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.account.mobile).toBe(mobile);
  });

  test('rejects an invalid mobile number', async () => {
    const res = await request(app).post('/api/auth/otp/request').send({ mobile: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_MOBILE');
  });

  test('rejects the wrong code', async () => {
    const mobile = uniqueMobile();
    const reqRes = await request(app).post('/api/auth/otp/request').send({ mobile });
    const wrongCode = reqRes.body.devCode === '000000' ? '111111' : '000000';

    const verifyRes = await request(app).post('/api/auth/otp/verify').send({ otpId: reqRes.body.otpId, code: wrongCode });
    expect(verifyRes.status).toBe(400);
    expect(verifyRes.body.error.code).toBe('OTP_INCORRECT');
  });

  test('locks out after the max number of incorrect attempts', async () => {
    const mobile = uniqueMobile();
    const reqRes = await request(app).post('/api/auth/otp/request').send({ mobile });
    const { otpId, devCode } = reqRes.body;
    const wrongCode = devCode === '000000' ? '111111' : '000000';

    // The first 5 (maxAttempts) wrong tries are each just "incorrect".
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/api/auth/otp/verify').send({ otpId, code: wrongCode });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('OTP_INCORRECT');
    }
    // The 6th try - even with the wrong code - is now blocked outright.
    const lockedOut = await request(app).post('/api/auth/otp/verify').send({ otpId, code: wrongCode });
    expect(lockedOut.status).toBe(429);
    expect(lockedOut.body.error.code).toBe('OTP_MAX_ATTEMPTS');

    // Even the *correct* code is now rejected until a fresh OTP is requested.
    const finalTry = await request(app).post('/api/auth/otp/verify').send({ otpId, code: devCode });
    expect(finalTry.status).toBe(429);
  });

  test('rejects verifying an already-consumed OTP session twice', async () => {
    const mobile = uniqueMobile();
    const reqRes = await request(app).post('/api/auth/otp/request').send({ mobile });
    const { otpId, devCode } = reqRes.body;

    const first = await request(app).post('/api/auth/otp/verify').send({ otpId, code: devCode });
    expect(first.status).toBe(200);

    const second = await request(app).post('/api/auth/otp/verify').send({ otpId, code: devCode });
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('INVALID_OTP_SESSION');
  });

  test('accepting the privacy policy clears needsPolicyAcceptance', async () => {
    const agent = request.agent(app);
    const mobile = uniqueMobile();
    const reqRes = await agent.post('/api/auth/otp/request').send({ mobile });
    await agent.post('/api/auth/otp/verify').send({ otpId: reqRes.body.otpId, code: reqRes.body.devCode });

    const acceptRes = await agent.post('/api/auth/accept-policy').send();
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.account.acceptedPolicy).toBe(true);
  });

  describe('Doctor authentication & role guards', () => {
    test('rejects doctor login if mobile is not registered as doctor', async () => {
      const mobile = uniqueMobile();
      const res = await request(app).post('/api/auth/otp/request').send({ mobile, intent: 'DOCTOR' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('DOCTOR_NOT_REGISTERED');
    });

    test('rejects doctor login if doctor account is inactive', async () => {
      const mobile = uniqueMobile();
      const account = await prisma.account.create({ data: { mobile, role: 'DOCTOR' } });
      const { doctor } = await makeSpecialityAndDoctor({ accountId: account.id, active: false });

      const res = await request(app).post('/api/auth/otp/request').send({ mobile, intent: 'DOCTOR' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('DOCTOR_INACTIVE');
    });

    test('allows registered active doctor to request OTP, verify, and log into Doctor portal', async () => {
      const agent = request.agent(app);
      const mobile = uniqueMobile();
      const account = await prisma.account.create({ data: { mobile, role: 'DOCTOR' } });
      await makeSpecialityAndDoctor({ accountId: account.id, active: true });

      const reqRes = await agent.post('/api/auth/otp/request').send({ mobile, intent: 'DOCTOR' });
      expect(reqRes.status).toBe(200);
      expect(reqRes.body.otpId).toBeTruthy();

      const verifyRes = await agent.post('/api/auth/otp/verify').send({
        otpId: reqRes.body.otpId,
        code: reqRes.body.devCode,
      });
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.account.role).toBe('DOCTOR');

      // Doctor can access doctor portal summary
      const summaryRes = await agent.get('/api/doctor/summary');
      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.counters).toBeDefined();

      // Doctor cannot access admin endpoints
      const adminRes = await agent.get('/api/admin/doctors');
      expect(adminRes.status).toBe(403);
    });
  });
});
