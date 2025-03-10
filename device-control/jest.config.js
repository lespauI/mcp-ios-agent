module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.spec.ts'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts'],
  coverageReporters: ['text', 'lcov'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
        isolatedModules: true,
      }
    ]
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^redis$': '<rootDir>/tests/mocks/redis-mock.js',
    '^opencv4nodejs-prebuilt$': '<rootDir>/tests/mocks/opencv-mock.js'
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 10000,
  verbose: true,
  transformIgnorePatterns: [
    "node_modules/(?!(chai|sinon|@sinonjs)/)"
  ]
}; 