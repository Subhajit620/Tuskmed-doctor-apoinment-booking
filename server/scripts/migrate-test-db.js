// Runs automatically before `npm test` (npm's pretest lifecycle hook).
// Applies committed migrations to TEST_DATABASE_URL so the isolated test
// database's schema never drifts from prisma/schema.prisma, without ever
// touching the dev database's DATABASE_URL.
require('dotenv').config();
const { execSync } = require('child_process');

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.warn('[pretest] TEST_DATABASE_URL not set - skipping test DB migration (tests will use DATABASE_URL).');
  process.exit(0);
}

execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: testUrl },
});
