const { PrismaClient } = require('@prisma/client');

// Single shared Prisma client instance (connection pooled).
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

module.exports = prisma;
