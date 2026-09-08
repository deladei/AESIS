/**
 * `connectRedis()` used to log an error on every single boot.
 *
 * `lazyConnect` defers connecting until the first command, and the rate limiter
 * builds its stores at import time — before `bootstrap()` runs — so the client
 * is already connecting by the time `connectRedis()` is reached, and a second
 * `connect()` rejects with "Redis is already connecting/connected". The guard
 * these tests cover is which statuses it is ours to connect from.
 */

const client = {
  status: 'wait' as string,
  connect: jest.fn().mockResolvedValue(undefined),
  ping:    jest.fn().mockResolvedValue('PONG'),
  on:      jest.fn(),
};

jest.mock('ioredis', () => ({ __esModule: true, default: jest.fn(() => client) }));
jest.mock('../env', () => ({
  env: { REDIS_URL: 'rediss://default:pw@example.upstash.io:6379' },
}));

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('../logger', () => ({ logger }));

describe('connectRedis', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    client.connect.mockResolvedValue(undefined);
    client.ping.mockResolvedValue('PONG');
  });

  it('connects when nothing has started the connection yet', async () => {
    client.status = 'wait';

    await (await import('../redis')).connectRedis();

    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it.each(['connecting', 'connect', 'ready', 'reconnecting'])(
    'does not call connect() again when the client is already %s',
    async (status) => {
      // This is the real boot ordering: the rate limiter's import-time commands
      // already kicked the connection off. Calling connect() here is what
      // produced the error line on every deploy.
      client.status = status;

      await (await import('../redis')).connectRedis();

      expect(client.connect).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalledWith(
        'Redis connect() rejected', expect.anything());
    },
  );

  it('still proves the client can round-trip a command', async () => {
    // Skipping connect() must not skip the self-test — that is the part that
    // actually shows Redis is usable rather than merely constructed.
    client.status = 'ready';

    await (await import('../redis')).connectRedis();

    expect(client.ping).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Redis PING ok', expect.anything());
  });

  it('reports a failed self-test rather than throwing out of bootstrap', async () => {
    client.status = 'ready';
    client.ping.mockRejectedValue(new Error('NOAUTH'));

    await expect((await import('../redis')).connectRedis()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith('Redis PING FAILED', expect.anything());
  });
});
