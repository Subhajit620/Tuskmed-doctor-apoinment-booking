const {
  loginAsNewPatient, makeSpecialityAndDoctor, makeFutureSlot, registerPatientProfile,
} = require('./helpers');

describe('Active-patient scoping', () => {
  test('booking is rejected until a patient profile exists and is active', async () => {
    const { doctor } = await makeSpecialityAndDoctor();
    const slot = await makeFutureSlot(doctor.id);
    const patient = await loginAsNewPatient();

    const res = await patient.agent.post('/api/appointments/book').send({
      doctorId: doctor.id, slotId: slot.id, mode: 'VIDEO',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_ACTIVE_PATIENT');
  });

  test('the first registered family member becomes active automatically', async () => {
    const patient = await loginAsNewPatient();
    const profile = await registerPatientProfile(patient.agent, { name: 'Alex' });

    const me = await patient.agent.get('/api/patients');
    expect(me.body.activePatientId).toBe(profile.id);
  });

  test('appointments booked for the active patient stay scoped to them after switching', async () => {
    const { doctor } = await makeSpecialityAndDoctor();
    const slotA = await makeFutureSlot(doctor.id, { hoursFromNow: 24 });
    const slotB = await makeFutureSlot(doctor.id, { hoursFromNow: 30 });

    const account = await loginAsNewPatient();
    const alex = await registerPatientProfile(account.agent, { name: 'Alex' });
    const jamie = await registerPatientProfile(account.agent, { name: 'Jamie' });

    // Still active = Alex (first registered). Book for Alex.
    const bookAlex = await account.agent.post('/api/appointments/book').send({
      doctorId: doctor.id, slotId: slotA.id, mode: 'VIDEO',
    });
    expect(bookAlex.status).toBe(201);
    // "My Appointments" only lists paid/confirmed bookings, not payment attempts.
    await account.agent.post(`/api/appointments/${bookAlex.body.appointmentId}/confirm-payment`).send({
      gatewayPaymentId: 'pay_alex', gatewayOrderId: bookAlex.body.order.id, mockOutcome: 'success',
    });

    // Switch active patient to Jamie and book a second appointment.
    const switchRes = await account.agent.patch('/api/patients/active').send({ patientId: jamie.id });
    expect(switchRes.status).toBe(200);
    expect(switchRes.body.activePatientId).toBe(jamie.id);

    const bookJamie = await account.agent.post('/api/appointments/book').send({
      doctorId: doctor.id, slotId: slotB.id, mode: 'VIDEO',
    });
    expect(bookJamie.status).toBe(201);
    await account.agent.post(`/api/appointments/${bookJamie.body.appointmentId}/confirm-payment`).send({
      gatewayPaymentId: 'pay_jamie', gatewayOrderId: bookJamie.body.order.id, mockOutcome: 'success',
    });

    // "My Booked Appointments" while Jamie is active must show only Jamie's booking.
    const mineAsJamie = await account.agent.get('/api/appointments/mine');
    expect(mineAsJamie.body.appointments).toHaveLength(1);
    expect(mineAsJamie.body.appointments[0].patient.name).toBe('Jamie');

    // Switch back to Alex - now only Alex's booking is visible.
    await account.agent.patch('/api/patients/active').send({ patientId: alex.id });
    const mineAsAlex = await account.agent.get('/api/appointments/mine');
    expect(mineAsAlex.body.appointments).toHaveLength(1);
    expect(mineAsAlex.body.appointments[0].patient.name).toBe('Alex');
  });

  test('an account cannot activate a patient profile it does not own', async () => {
    const accountA = await loginAsNewPatient();
    await registerPatientProfile(accountA.agent, { name: 'Owner Patient' });
    const otherPatientId = (await require('./helpers').prisma.patient.findFirst({ where: { name: 'Owner Patient' } })).id;

    const accountB = await loginAsNewPatient();
    const res = await accountB.agent.patch('/api/patients/active').send({ patientId: otherPatientId });
    expect(res.status).toBe(404);
  });
});
