module.exports = {
  testEnvironment: 'node',
  testTimeout: 20000,
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  globalTeardown: '<rootDir>/tests/teardown.js',
};
