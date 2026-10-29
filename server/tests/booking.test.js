const {
  app, prisma, loginAsNewPatient, makeSpecialityAndDoctor, makeFutureSlot, registerPatientProfile,
} = require('./helpers');
const request = require('supertest');

describe('Slot lock + payment path', () => {
  test('booking locks the slot, and a second patient cannot book the same slot', async () => {
    const { doctor } = await makeSpecialityAndDoctor();
    const slot = await makeFutureSlot(doctor.id, { mode: 'VIDEO' });

    const patientA = await loginAsNewPatient();
    await registerPatientProfile(patientA.agent);

    const bookRes = await patientA.agent.post('/api/appointments/book').send({
      doctorId: doctor.id,
      slotId: slot.id,
      mode: 'VIDEO',
      symptoms: 'Fever for two days',
    });
    expect(bookRes.status).toBe(201);
    expect(bookRes.body.appointmentId).toBeTruthy();

    const lockedSlot = await prisma.slot.findUnique({ where: { id: slot.id } });
    expect(lockedSlot.status).toBe('LOCKED');

    // A second, different patient racing for the same slot must be rejected.
    const patientB = await loginAsNewPatient();
    await registerPatientProfile(patientB.agent);
    const secondAttempt = await patientB.agent.post('/api/appointments/book').send({
      doctorId: doctor.id,
      slotId: slot.id,
      mode: 'VIDEO',
    });
    expect(secondAttempt.status).toBe(409);
    expect(secondAttempt.body.error.code).toBe('SLOT_UNAVAILABLE');

    // DB-level guarantee: at most one appointment can ever reference this slot.
    const appointmentsForSlot = await prisma.appointment.count({ where: { slotId: slot.id } });
    expect(appointmentsForSlot).toBe(1);
  });

  test('successful payment confirms the appointment and books the slot', async () => {
    const { doctor } = await makeSpecialityAndDoctor();
    const slot = await makeFutureSlot(doctor.id, { mode: 'VIDEO' });
    const patient = await loginAsNewPatient();
    await registerPatientProfile(patient.agent);

    const bookRes = await patient.agent.post('/api/appointments/book').send({
      doctorId: doctor.id, slotId: slot.id, mode: 'VIDEO',
    });
    const { appointmentId } = bookRes.body;

    const confirmRes = await patient.agent.post(`/api/appointments/${appointmentId}/confirm-payment`).send({
      gatewayPaymentId: 'pay_test_1', gatewayOrderId: bookRes.body.order.id, mockOutcome: 'success',
    });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.appointment.status).toBe('CONFIRMED');
    expect(confirmRes.body.appointment.videoLink).toBeTruthy(); // video room created on confirm

    const bookedSlot = await prisma.slot.findUnique({ where: { id: slot.id } });
    expect(bookedSlot.status).toBe('BOOKED');
  });

  test('failed payment releases the slot back to AVAILABLE, and it can be rebooked', async () => {
    const { doctor } = await makeSpecialityAndDoctor();
    const slot = await makeFutureSlot(doctor.id, { mode: 'IN_CLINIC' });
    const patient = await loginAsNewPatient();
    await registerPatientProfile(patient.agent);

    const bookRes = await patient.agent.post('/api/appointments/book').send({
      doctorId: doctor.id, slotId: slot.id, mode: 'IN_CLINIC',
    });
    const { appointmentId } = bookRes.body;

    const confirmRes = await patient.agent.post(`/api/appointments/${appointmentId}/confirm-payment`).send({
      gatewayPaymentId: 'pay_test_2', gatewayOrderId: bookRes.body.order.id, mockOutcome: 'failure',
    });
    expect(confirmRes.status).toBe(400);

    const releasedSlot = await prisma.slot.findUnique({ where: { id: slot.id } });
    expect(releasedSlot.status).toBe('AVAILABLE');

    const cancelledAppt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(cancelledAppt.status).toBe('CANCELLED');

    // The now-available slot can be booked by someone else.
    const otherPatient = await loginAsNewPatient();
    await registerPatientProfile(otherPatient.agent);
    const rebookRes = await otherPatient.agent.post('/api/appointments/book').send({
      doctorId: doctor.id, slotId: slot.id, mode: 'IN_CLINIC',
    });
    expect(rebookRes.status).toBe(201);
  });

  test('a promo code updates the fee shown before commit, and an expired code is rejected', async () => {
    const { doctor } = await makeSpecialityAndDoctor({ fee: 1000 });
    await prisma.promoCode.create({
      data: { code: `SAVE20_${Date.now()}`, discountPct: 20, expiry: new Date(Date.now() + 86400000), maxUses: 10 },
    });
    const expired = await prisma.promoCode.create({
      data: { code: `OLD5_${Date.now()}`, discountPct: 5, expiry: new Date(Date.now() - 86400000) },
    });

    const validCode = (await prisma.promoCode.findFirst({ where: { discountPct: 20 }, orderBy: { createdAt: 'desc' } })).code;

    const preview = await request(app).get('/api/appointments/promo/preview').query({ code: validCode, doctorId: doctor.id });
    // No auth cookie -> should still require auth
    expect(preview.status).toBe(401);

    const patient = await loginAsNewPatient();
    const validPreview = await patient.agent.get('/api/appointments/promo/preview').query({ code: validCode, doctorId: doctor.id });
    expect(validPreview.status).toBe(200);
    expect(validPreview.body.state).toBe('valid');
    expect(Number(validPreview.body.finalAmount)).toBe(800);

    const expiredPreview = await patient.agent.get('/api/appointments/promo/preview').query({ code: expired.code, doctorId: doctor.id });
    expect(expiredPreview.body.state).toBe('expired');

    const invalidPreview = await patient.agent.get('/api/appointments/promo/preview').query({ code: 'DOES_NOT_EXIST', doctorId: doctor.id });
    expect(invalidPreview.body.state).toBe('invalid');
  });
});
