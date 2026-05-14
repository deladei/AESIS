jest.mock('../../../config/env', () => ({
  env: {
    NODE_ENV:         'test',
    SENDGRID_API_KEY: undefined,
    FRONTEND_URL:     'http://localhost:5173',
    EMAIL_FROM:       'test@aesis.edu',
    EMAIL_FROM_NAME:  'AESIS Test',
  },
}));

jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

import { sendEmail, buildVerificationEmail, buildPasswordResetEmail } from '../email';

describe('buildVerificationEmail', () => {
  it('returns HTML string containing the token URL', () => {
    const html = buildVerificationEmail('Ada', 'tok123');
    expect(html).toContain('verify-email?token=tok123');
    expect(html).toContain('Ada');
  });

  it('includes FRONTEND_URL in the link', () => {
    const html = buildVerificationEmail('Ola', 'abc');
    expect(html).toContain('http://localhost:5173');
  });
});

describe('buildPasswordResetEmail', () => {
  it('returns HTML containing the reset token URL', () => {
    const html = buildPasswordResetEmail('Kemi', 'reset-tok');
    expect(html).toContain('reset-password/confirm?token=reset-tok');
    expect(html).toContain('Kemi');
  });
});

describe('sendEmail', () => {
  it('logs to console in dev/test mode instead of sending (no transport)', async () => {
    const { logger } = jest.requireMock('../../../config/logger');
    // In test env SENDGRID_API_KEY is undefined → transport is null → logs info
    await sendEmail({ to: 'test@cs.edu', subject: 'Test', html: '<p>Hello</p>' });
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('DEV EMAIL'),
      expect.objectContaining({ to: 'test@cs.edu' }),
    );
  });

  it('does not throw when called in test mode', async () => {
    await expect(
      sendEmail({ to: 'x@y.com', subject: 'Hi', html: 'body' }),
    ).resolves.toBeUndefined();
  });
});
