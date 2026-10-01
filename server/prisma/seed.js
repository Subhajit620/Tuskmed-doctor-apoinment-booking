const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function daysFromNow(n, hour, minute = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

function daysAgo(n, hour, minute = 0) {
  return daysFromNow(-n, hour, minute);
}

function pick(arr, i) {
  return arr[i % arr.length];
}

/**
 * Doctor Dashboard demo data: Dr. Varun Khanna with a realistic history
 * (30 patients, 34 past consults spread over the last 3 months, a mix of
 * video/in-clinic, prescriptions sent for some but not all) so all 7
 * doctor-dashboard screens have real data to show on first login. Skips
 * regenerating history if it already exists, so re-running seed is safe.
 */
async function seedDoctorDashboardDemo() {
  const speciality = await prisma.speciality.upsert({
    where: { name: 'Orthopaedics & Spine Surgery' },
    update: {},
    create: { name: 'Orthopaedics & Spine Surgery', keywords: ['spine', 'back pain', 'slipped disc', 'joint pain', 'fracture'] },
  });

  const account = await prisma.account.upsert({
    where: { mobile: '+919000000007' },
    update: { role: 'DOCTOR' },
    create: { mobile: '+919000000007', role: 'DOCTOR', verified: true, acceptedPolicyAt: new Date() },
  });

  const doctor = await prisma.doctor.upsert({
    where: { accountId: account.id },
    update: {},
    create: {
      accountId: account.id,
      specialityId: speciality.id,
      name: 'Dr. Varun Khanna',
      title: 'Dr.',
      firstName: 'Varun',
      lastName: 'Khanna',
      email: 'varun.khanna@tuskmed.example',
      sex: 'MALE',
      dob: new Date('1979-04-12'),
      address: 'B-42, Sushant Lok Phase 1',
      clinicLocation: 'TuskMed Ortho & Spine Clinic, Sector 15, Gurugram',
      city: 'Gurugram',
      state: 'Haryana',
      fee: 600,
      clinicFee: 0,
      rating: 4.8,
      languages: ['Hindi', 'English', 'Bengali', 'Punjabi'],
      experienceYrs: 16,
      registrationNo: 'ORT-SPINE-4471',
      bio: 'Dr. Varun Khanna is an Orthopaedics & Spine Surgeon with 16 years of experience in spine care, joint disorders and sports injuries.',
    },
  });

  // Future template slots for booking (same pattern as the other doctors).
  for (let day = 1; day <= 5; day += 1) {
    const combos = [{ hour: 10, mode: 'VIDEO' }, { hour: 11, mode: 'VIDEO' }, { hour: 15, mode: 'IN_CLINIC' }, { hour: 16, mode: 'IN_CLINIC' }];
    for (const combo of combos) {
      const start = daysFromNow(day, combo.hour);
      const end = daysFromNow(day, combo.hour, 30);
      // eslint-disable-next-line no-await-in-loop
      const existing = await prisma.slot.findFirst({ where: { doctorId: doctor.id, start } });
      if (!existing) {
        // eslint-disable-next-line no-await-in-loop
        await prisma.slot.create({ data: { doctorId: doctor.id, start, end, mode: combo.mode } });
      }
    }
  }

  // One blocked stretch, to populate "Your Blocked Days".
  const blockAlreadyExists = await prisma.blockedPeriod.findFirst({ where: { doctorId: doctor.id } });
  if (!blockAlreadyExists) {
    await prisma.blockedPeriod.create({
      data: {
        doctorId: doctor.id,
        startDate: daysFromNow(20, 0),
        endDate: daysFromNow(22, 23, 59),
        mode: 'BOTH',
      },
    });
  }

  const historyAlreadyExists = await prisma.appointment.findFirst({ where: { doctorId: doctor.id } });
  if (historyAlreadyExists) return; // idempotent - don't regenerate on every seed run

  const firstNames = ['Aarav', 'Vivaan', 'Aditya', 'Ishaan', 'Kabir', 'Ananya', 'Diya', 'Saanvi', 'Myra', 'Aadhya',
    'Reyansh', 'Arjun', 'Kiaan', 'Sara', 'Anika', 'Vihaan', 'Rohan', 'Priya', 'Neha', 'Meera',
    'Aryan', 'Dhruv', 'Ira', 'Zara', 'Yash', 'Tara', 'Kunal', 'Simran', 'Rahul', 'Pooja'];
  const lastNames = ['Sharma', 'Verma', 'Gupta', 'Malhotra', 'Chopra', 'Bansal', 'Kapoor', 'Joshi', 'Reddy', 'Nair',
    'Iyer', 'Menon', 'Rao', 'Bose', 'Sen', 'Ghosh', 'Chatterjee', 'Mukherjee', 'Saxena', 'Aggarwal',
    'Bhatia', 'Khurana', 'Tandon', 'Mehra', 'Trivedi', 'Pillai', 'Das', 'Roy', 'Kulkarni', 'Pandey'];
  const cities = ['Gurugram', 'New Delhi', 'Noida', 'Faridabad', 'Ghaziabad'];

  const patients = [];
  for (let i = 0; i < 30; i += 1) {
    const name = `${pick(firstNames, i)} ${pick(lastNames, i + 7)}`;
    const mobile = `+9198${String(1000000 + i).padStart(7, '0')}`;
    // eslint-disable-next-line no-await-in-loop
    const patientAccount = await prisma.account.upsert({
      where: { mobile },
      update: {},
      create: { mobile, role: 'PATIENT', verified: true, acceptedPolicyAt: new Date() },
    });
    const age = 22 + (i % 45);
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - age, i % 12, 1 + (i % 27));
    // eslint-disable-next-line no-await-in-loop
    let patient = await prisma.patient.findFirst({ where: { accountId: patientAccount.id } });
    if (!patient) {
      // eslint-disable-next-line no-await-in-loop
      patient = await prisma.patient.create({
        data: {
          accountId: patientAccount.id,
          name,
          mobile,
          dob,
          gender: i % 2 === 0 ? 'MALE' : 'FEMALE',
          city: pick(cities, i),
          state: 'Delhi NCR',
        },
      });
      // eslint-disable-next-line no-await-in-loop
      await prisma.account.update({ where: { id: patientAccount.id }, data: { activePatientId: patient.id } });
    }
    patients.push(patient);
  }

  // 30 patients get one visit each; 4 of them get a follow-up second visit -> 34 total.
  const visits = patients.map((p, i) => ({ patient: p, daysAgoOffset: 3 + i * 2.6 }));
  for (let i = 0; i < 4; i += 1) {
    // Must land more recently (fewer days ago) than that patient's original visit.
    const followUpOffset = Math.max(1, Math.round((3 + i * 2.6) / 2));
    visits.push({ patient: patients[i], daysAgoOffset: followUpOffset });
  }

  const medicinesBank = [
    { name: 'Ibuprofen', dosage: '400mg', frequency: 'Twice daily after food' },
    { name: 'Calcium + Vitamin D3', dosage: '500mg', frequency: 'Once daily' },
    { name: 'Muscle relaxant (Thiocolchicoside)', dosage: '4mg', frequency: 'Twice daily' },
    { name: 'Physiotherapy', dosage: '-', frequency: '3 sessions/week for 2 weeks' },
  ];

  let created = 0;
  for (const visit of visits) {
    const hour = 10 + (created % 7);
    const start = daysAgo(Math.round(visit.daysAgoOffset), hour);
    const end = daysAgo(Math.round(visit.daysAgoOffset), hour, 30);
    const mode = created % 3 === 0 ? 'IN_CLINIC' : 'VIDEO';

    // eslint-disable-next-line no-await-in-loop
    const slot = await prisma.slot.create({ data: { doctorId: doctor.id, start, end, mode, status: 'BOOKED' } });

    const priorForPatient = visits.filter((v) => v.patient.id === visit.patient.id);
    const isFollowUp = priorForPatient.length > 1 && priorForPatient.indexOf(visit) > 0;

    // eslint-disable-next-line no-await-in-loop
    const appointment = await prisma.appointment.create({
      data: {
        patientId: visit.patient.id,
        doctorId: doctor.id,
        slotId: slot.id,
        mode,
        status: 'COMPLETED',
        symptoms: isFollowUp ? 'Follow-up review of previous spine/joint complaint' : 'Lower back pain radiating to the leg for 2 weeks',
        isFollowUp,
      },
    });

    const fee = mode === 'VIDEO' ? 600 : 0;
    // eslint-disable-next-line no-await-in-loop
    await prisma.payment.create({
      data: {
        appointmentId: appointment.id,
        originalAmount: fee,
        amount: fee,
        status: 'SUCCESS',
        gatewayOrderId: `order_seed_${appointment.id.slice(0, 8)}`,
        gatewayPaymentId: `pay_seed_${appointment.id.slice(0, 8)}`,
      },
    });

    // ~75% have a prescription sent - the rest exercise the "Not Sent" badge.
    if (created % 4 !== 3) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.prescription.create({
        data: {
          appointmentId: appointment.id,
          medicines: [pick(medicinesBank, created), pick(medicinesBank, created + 2)],
          notes: 'Review in 2 weeks if symptoms persist.',
        },
      });
    }
    // ~50% also get a written report.
    if (created % 2 === 0) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.report.create({
        data: { appointmentId: appointment.id, content: 'Clinical exam unremarkable beyond reported pain. Advised rest, medication and physiotherapy as prescribed.' },
      });
    }

    created += 1;
  }

  // A handful of upcoming, already-confirmed appointments so the Dashboard
  // (Home) Today/Next-30-Days screen has real rows too.
  const upcomingPlans = [
    { daysOut: 0, hour: 17, mode: 'VIDEO' }, // today
    { daysOut: 2, hour: 10, mode: 'VIDEO' },
    { daysOut: 4, hour: 15, mode: 'IN_CLINIC' },
    { daysOut: 9, hour: 11, mode: 'VIDEO' },
    { daysOut: 14, hour: 16, mode: 'IN_CLINIC' },
    { daysOut: 25, hour: 10, mode: 'VIDEO' },
  ];
  for (let i = 0; i < upcomingPlans.length; i += 1) {
    const plan = upcomingPlans[i];
    const patient = patients[i];
    const start = daysFromNow(plan.daysOut, plan.hour);
    const end = daysFromNow(plan.daysOut, plan.hour, 30);
    // eslint-disable-next-line no-await-in-loop
    const slot = await prisma.slot.create({ data: { doctorId: doctor.id, start, end, mode: plan.mode, status: 'BOOKED' } });
    const fee = plan.mode === 'VIDEO' ? 600 : 0;
    // eslint-disable-next-line no-await-in-loop
    const appointment = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        doctorId: doctor.id,
        slotId: slot.id,
        mode: plan.mode,
        status: 'CONFIRMED',
        symptoms: 'Scheduled follow-up consultation.',
        videoLink: plan.mode === 'VIDEO' ? `https://tuskmed.daily.co/tuskmed-seed-${slot.id.slice(0, 8)}` : null,
      },
    });
    // eslint-disable-next-line no-await-in-loop
    await prisma.payment.create({
      data: { appointmentId: appointment.id, originalAmount: fee, amount: fee, status: 'SUCCESS' },
    });
  }

  console.log(`Seeded Dr. Varun Khanna: ${patients.length} patients, ${created} past consults, ${upcomingPlans.length} upcoming.`);
}

async function main() {
  console.log('Seeding TuskMed Teleconsult...');

  // ---- Admin account ----
  // Fixed to the project owner's real WhatsApp number, in the app's
  // canonical "+91XXXXXXXXXX" form (see server/src/utils/mobile.js) -
  // auth.js normalizes every login attempt to this same form before
  // lookup, so "8101421053" and "+918101421053" both reach this account.
  await prisma.account.upsert({
    where: { mobile: '+918101421053' },
    update: { role: 'ADMIN' },
    create: { mobile: '+918101421053', role: 'ADMIN', verified: true, acceptedPolicyAt: new Date() },
  });

  // ---- Specialities ----
  const specialityDefs = [
    { name: 'General Physician', keywords: ['fever', 'cold', 'cough', 'headache', 'body ache', 'flu'] },
    { name: 'Dermatology', keywords: ['skin', 'rash', 'acne', 'itching', 'eczema', 'hair fall'] },
    { name: 'Pediatrics', keywords: ['child', 'infant', 'baby', 'kid', 'vaccination'] },
    { name: 'Cardiology', keywords: ['chest pain', 'heart', 'palpitation', 'blood pressure', 'bp'] },
    { name: 'Gynecology', keywords: ['pregnancy', 'periods', 'menstrual', 'pcos', 'women health'] },
    { name: 'Orthopedics', keywords: ['joint pain', 'fracture', 'back pain', 'knee', 'bone'] },
    { name: 'Psychiatry', keywords: ['anxiety', 'depression', 'stress', 'sleep', 'mental health'] },
    { name: 'ENT', keywords: ['ear', 'nose', 'throat', 'sinus', 'hearing'] },
  ];
  const specialities = {};
  for (const def of specialityDefs) {
    specialities[def.name] = await prisma.speciality.upsert({
      where: { name: def.name },
      update: { keywords: def.keywords },
      create: def,
    });
  }

  // ---- Doctors ----
  const doctorDefs = [
    { mobile: '+919000000001', name: 'Dr. Asha Rao', speciality: 'General Physician', fee: 499, rating: 4.7, languages: ['English', 'Hindi'], experienceYrs: 12, registrationNo: 'GP-10234' },
    { mobile: '+919000000002', name: 'Dr. Karan Mehta', speciality: 'Dermatology', fee: 699, rating: 4.6, languages: ['English', 'Hindi', 'Gujarati'], experienceYrs: 9, registrationNo: 'DER-88213' },
    { mobile: '+919000000003', name: 'Dr. Neha Iyer', speciality: 'Pediatrics', fee: 599, rating: 4.9, languages: ['English', 'Tamil'], experienceYrs: 15, registrationNo: 'PED-55521' },
    { mobile: '+919000000004', name: 'Dr. Rohit Sharma', speciality: 'Cardiology', fee: 999, rating: 4.8, languages: ['English', 'Hindi'], experienceYrs: 18, registrationNo: 'CAR-77410' },
    { mobile: '+919000000005', name: 'Dr. Priya Nair', speciality: 'Gynecology', fee: 799, rating: 4.7, languages: ['English', 'Malayalam'], experienceYrs: 11, registrationNo: 'GYN-33219' },
    { mobile: '+919000000006', name: 'Dr. Sameer Khan', speciality: 'Orthopedics', fee: 749, rating: 4.5, languages: ['English', 'Urdu', 'Hindi'], experienceYrs: 14, registrationNo: 'ORT-99087' },
  ];

  const doctors = [];
  for (const def of doctorDefs) {
    const account = await prisma.account.upsert({
      where: { mobile: def.mobile },
      update: { role: 'DOCTOR' },
      create: { mobile: def.mobile, role: 'DOCTOR', verified: true, acceptedPolicyAt: new Date() },
    });
    const doctor = await prisma.doctor.upsert({
      where: { accountId: account.id },
      update: {},
      create: {
        accountId: account.id,
        specialityId: specialities[def.speciality].id,
        name: def.name,
        fee: def.fee,
        rating: def.rating,
        languages: def.languages,
        experienceYrs: def.experienceYrs,
        registrationNo: def.registrationNo,
        bio: `${def.name} is a board-certified ${def.speciality} specialist with ${def.experienceYrs} years of experience.`,
      },
    });
    doctors.push(doctor);
  }

  // ---- Slots: next 5 days, morning + afternoon, video + in-clinic ----
  for (const doctor of doctors) {
    for (let day = 1; day <= 5; day += 1) {
      const combos = [
        { hour: 10, mode: 'VIDEO' },
        { hour: 11, mode: 'VIDEO' },
        { hour: 15, mode: 'IN_CLINIC' },
        { hour: 16, mode: 'IN_CLINIC' },
      ];
      for (const combo of combos) {
        const start = daysFromNow(day, combo.hour);
        const end = daysFromNow(day, combo.hour, 30);
        const existing = await prisma.slot.findFirst({ where: { doctorId: doctor.id, start } });
        if (!existing) {
          // eslint-disable-next-line no-await-in-loop
          await prisma.slot.create({ data: { doctorId: doctor.id, start, end, mode: combo.mode } });
        }
      }
    }
  }

  // ---- Promo codes ----
  await prisma.promoCode.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: { code: 'WELCOME10', discountPct: 10, expiry: daysFromNow(90, 23, 59), maxUses: 1000 },
  });
  await prisma.promoCode.upsert({
    where: { code: 'FLAT100' },
    update: {},
    create: { code: 'FLAT100', discountPct: 20, expiry: daysFromNow(30, 23, 59), maxUses: 200 },
  });
  await prisma.promoCode.upsert({
    where: { code: 'EXPIRED5' },
    update: {},
    create: { code: 'EXPIRED5', discountPct: 5, expiry: daysFromNow(-1, 23, 59), maxUses: 100 },
  });

  // ---- Doctor dashboard demo: Dr. Varun Khanna ----
  await seedDoctorDashboardDemo();

  // ---- Platform config defaults ----
  await prisma.config.upsert({
    where: { key: 'otp_settings' },
    update: {},
    create: { key: 'otp_settings', value: { expiryMinutes: 5, resendCooldownSeconds: 30, maxAttempts: 5, maxResends: 5 } },
  });
  await prisma.config.upsert({
    where: { key: 'policies' },
    update: {},
    create: {
      key: 'policies',
      value: {
        privacyPolicyUrl: 'https://tuskmed.example/privacy',
        termsUrl: 'https://tuskmed.example/terms',
      },
    },
  });

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
