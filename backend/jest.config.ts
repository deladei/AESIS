import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/config/seed.ts',
    '!src/server.ts',
  ],
  coverageThreshold: {
    global: {
      branches:   75,
      functions:  75,
      lines:      75,
      statements: 75,
    },
  },
};

export default config;
