/**
 * Whether mail can actually leave this server.
 *
 * `sendEmail` deliberately swallows failures — a password-reset request must
 * not 500 because SMTP is down — but swallowing them left no signal anywhere
 * that mail had stopped. A user asks for a reset, is told to check their inbox,
 * and nothing arrives. This is what makes that visible.
 */
const mockEnv: Record<string, string | undefined> = {
  NODE_ENV: 'production',
  SENDGRID_API_KEY: 'SG.realkey',
  EMAIL_FROM: 'noreply@cs.ug.edu.gh',
  EMAIL_FROM_NAME: 'AESIS',
};

jest.mock('../../../config/env', () => ({ env: mockEnv }));
jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('nodemailer', () => ({
  default: { createTransport: jest.fn(() => ({ sendMail: jest.fn() })) },
  createTransport: jest.fn(() => ({ sendMail: jest.fn() })),
}));

import { emailStatus } from '../email';

describe('emailStatus', () => {
  it('reports a properly configured sender as deliverable', () => {
    const s = emailStatus();
    expect(s).toMatchObject({
      configured: true, deliverable: true, from: 'noreply@cs.ug.edu.gh',
    });
    expect(s.problem).toBeUndefined();
  });

  it('never publishes the API key', () => {
    expect(JSON.stringify(emailStatus())).not.toContain('SG.realkey');
  });

  it('names the placeholder FROM address as the problem', () => {
    // The blueprint default. SendGrid rejects any send whose FROM is not a
    // verified sender identity, and this domain is a placeholder nobody owns —
    // so a perfectly valid key still delivers nothing, and the 403 that says
    // so was being swallowed.
    mockEnv.EMAIL_FROM = 'noreply@aesis.cs.edu';
    const s = emailStatus();

    expect(s.configured).toBe(true);
    // Configured is not the same as working. This is the distinction the
    // endpoint exists to draw.
    expect(s.deliverable).toBe(false);
    expect(s.problem).toMatch(/verified sender/);
  });

  it('reports a missing key in production as delivering nothing', () => {
    mockEnv.EMAIL_FROM = 'noreply@cs.ug.edu.gh';
    mockEnv.SENDGRID_API_KEY = undefined;

    const s = emailStatus();
    expect(s.configured).toBe(false);
    expect(s.deliverable).toBe(false);
    expect(s.problem).toMatch(/not set/);
  });

  it('treats a missing key outside production as expected, not broken', () => {
    mockEnv.NODE_ENV = 'development';
    mockEnv.SENDGRID_API_KEY = undefined;

    const s = emailStatus();
    expect(s.problem).toMatch(/expected outside production/);
  });
});
