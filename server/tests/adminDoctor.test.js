const request = require('supertest');
const { app, prisma, uniqueMobile, makeSpecialityAndDoctor } = require('./helpers');

describe('Admin Doctor Management', () => {
  let adminAgent;

  beforeAll(async () => {
    adminAgent = request.agent(app);
    // Onboard an admin
    const adminMobile = '+919999999999';
    let adminAccount = await prisma.account.findUnique({ where: { mobile: adminMobile } });
    if (!adminAccount) {
      adminAccount = await prisma.account.create({
        data: { mobile: adminMobile, role: 'ADMIN', verified: true, acceptedPolicyAt: new Date() },
      });
    } else if (adminAccount.role !== 'ADMIN') {
      await prisma.account.update({ where: { id: adminAccount.id }, data: { role: 'ADMIN' } });
    }

    const reqRes = await adminAgent.post('/api/auth/otp/request').send({ mobile: adminMobile });
    await adminAgent.post('/api/auth/otp/verify').send({ otpId: reqRes.body.otpId, code: reqRes.body.devCode });
  });

  test('admin can delete a doctor and their associated slots', async () => {
    const { doctor, speciality } = await makeSpecialityAndDoctor();

    // Create a slot for this doctor
    await prisma.slot.create({
      data: {
        doctorId: doctor.id,
        start: new Date(Date.now() + 86400000),
        end: new Date(Date.now() + 86400000 + 1800000),
        mode: 'VIDEO',
        status: 'AVAILABLE',
      },
    });

    const deleteRes = await adminAgent.delete(`/api/admin/doctors/${doctor.id}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.ok).toBe(true);

    const checkDoctor = await prisma.doctor.findUnique({ where: { id: doctor.id } });
    expect(checkDoctor).toBeNull();

    const checkSlots = await prisma.slot.findMany({ where: { doctorId: doctor.id } });
    expect(checkSlots.length).toBe(0);
  });
});
