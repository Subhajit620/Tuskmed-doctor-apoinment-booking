const http = require('http');
const { createApp } = require('./app');
const env = require('./config/env');
const { initIo } = require('./realtime/io');
const { startSlotSweeper } = require('./jobs/slotSweeper');
const { startReminderJob } = require('./jobs/reminderJob');

const app = createApp();
const server = http.createServer(app);

initIo(server, env.clientOrigin);
startSlotSweeper();
startReminderJob();

server.listen(env.port, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`TuskMed Teleconsult API listening on :${env.port} (${env.nodeEnv}, mockIntegrations=${env.mockIntegrations})`);
});

module.exports = server;
