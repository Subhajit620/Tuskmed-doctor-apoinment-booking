const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const env = require('./config/env');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const specialityRoutes = require('./routes/specialities');
const doctorRoutes = require('./routes/doctors');
const appointmentRoutes = require('./routes/appointments');
const paymentRoutes = require('./routes/payments');
const queryRoutes = require('./routes/queries');
const supportRoutes = require('./routes/support');
const doctorPortalRoutes = require('./routes/doctorPortal');
const adminRoutes = require('./routes/admin');

function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(cors({ origin: true, credentials: true }));

  // The payment webhook needs the raw request body to verify its
  // signature, so it must be wired up *before* the global json parser.
  app.use('/api/payments', express.raw({ type: 'application/json' }), paymentRoutes);

  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  // Locally-uploaded files (mock storage mode) are served from here.
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

  app.get('/api/health', (req, res) => res.json({ ok: true, env: env.nodeEnv }));

  app.use('/api/auth', authRoutes);
  app.use('/api/patients', patientRoutes);
  app.use('/api/specialities', specialityRoutes);
  app.use('/api/doctors', doctorRoutes);
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/queries', queryRoutes);
  app.use('/api/support', supportRoutes);
  app.use('/api/doctor', doctorPortalRoutes);
  app.use('/api/admin', adminRoutes);

  // Serve built frontend (client/dist) and SPA fallback for routes like /consultation/:id
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  const clientIndex = path.join(clientDist, 'index.html');
  if (fs.existsSync(clientIndex)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
      return res.sendFile(clientIndex);
    });
  }

  app.use((req, res) => res.status(404).json({ error: { message: 'Not found', code: 'NOT_FOUND' } }));
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
