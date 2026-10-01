module.exports = async () => {
  try {
    // eslint-disable-next-line global-require
    const prisma = require('../src/db/prisma');
    await prisma.$disconnect();
  } catch {
    // ignore
  }
};
