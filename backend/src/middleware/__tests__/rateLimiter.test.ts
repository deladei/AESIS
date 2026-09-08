/**
 * The bug this file exists for was invisible except in production logs.
 *
 * `rate-limit-redis` loads its two Lua scripts in its CONSTRUCTOR and keeps the
 * promises without awaiting them. Because the limiters below are module-level
 * consts, that happens at IMPORT time — before `bootstrap()` connects anything
 * — so on a cold boot the commands raced a still-connecting client, lost to the
 * 1.5s timeout, and rejected with no handler attached. Every deploy logged two
 * "Unhandled promise rejection: redis-command-timeout" lines.
 *
 * So importing the module IS the reproduction, which is what these assert.
 */

/** Node reports an unhandled rejection only after the microtask queue drains. */
const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

const redisCall = jest.fn();

jest.mock('../../config/redis', () => ({
  getRedis: () => ({ call: (...args: string[]) => redisCall(...args) }),
}));
jest.mock('../../config/env', () => ({ env: { NODE_ENV: 'test' } }));

describe('rate limiter Redis store', () => {
  let unhandled: unknown[];
  let onUnhandled: (reason: unknown) => void;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    unhandled = [];
    onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
  });

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
  });

  it('leaves no unhandled rejection when a boot-time command never answers', async () => {
    // A client that is still connecting: the command is queued and never
    // settles inside the timeout. This is the cold-boot case exactly.
    redisCall.mockImplementation(() => new Promise(() => { /* never settles */ }));

    await import('../rateLimiter');
    await settle(2_000);

    expect(redisCall).toHaveBeenCalled();      // the repro really did fire
    expect(unhandled).toEqual([]);
  }, 15_000);

  it('leaves no unhandled rejection when the command rejects after losing the race', async () => {
    // The nastier ordering: the timeout wins first, then the real command
    // rejects later with nobody listening.
    redisCall.mockImplementation(
      () => new Promise((_, reject) =>
        setTimeout(() => reject(new Error('ECONNRESET')), 1_800)),
    );

    await import('../rateLimiter');
    await settle(3_000);

    expect(unhandled).toEqual([]);
  }, 15_000);

  it('still surfaces the timeout to its caller, so passOnStoreError can fail open', async () => {
    // Marking the rejection handled must NOT swallow it — a real outage has to
    // keep reaching express-rate-limit, or rate limiting silently starts
    // blocking instead of failing open.
    redisCall.mockImplementation(() => new Promise(() => { /* never settles */ }));

    const store = (await import('../rateLimiter')).makeStore('aesis:rl:test:');
    // RedisStore wraps our function, so this is the shape it calls it with.
    await expect(
      (store as unknown as { sendCommand: (a: { command: string[] }) => Promise<unknown> })
        .sendCommand({ command: ['PING'] }),
    ).rejects.toThrow('redis-command-timeout');

    expect(unhandled).toEqual([]);
  }, 15_000);
});
