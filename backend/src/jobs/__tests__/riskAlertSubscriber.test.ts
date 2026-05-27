jest.mock('ioredis');

jest.mock('../../config/env', () => ({
  env: { REDIS_URL: 'redis://localhost:6379' },
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../shared/utils/socketEmitter', () => ({
  emitToUser: jest.fn(),
}));

import Redis from 'ioredis';
import { startRiskAlertSubscriber } from '../riskAlertSubscriber';
import { emitToUser } from '../../shared/utils/socketEmitter';

const MockRedis = Redis as jest.MockedClass<typeof Redis>;

function buildMockRedisInstance() {
  const handlers: Record<string, Function> = {};
  let subscribeCallback: Function | undefined;

  const instance = {
    on: jest.fn((event: string, cb: Function) => { handlers[event] = cb; }),
    subscribe: jest.fn((_channel: string, cb: Function) => { subscribeCallback = cb; }),
    _triggerEvent: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
    _triggerSubscribeCallback: (...args: unknown[]) => subscribeCallback?.(...args),
    _triggerMessage: (channel: string, message: string) => handlers['message']?.(channel, message),
  };
  return instance;
}

afterEach(() => jest.clearAllMocks());

describe('startRiskAlertSubscriber', () => {
  let mockInstance: ReturnType<typeof buildMockRedisInstance>;

  beforeEach(() => {
    mockInstance = buildMockRedisInstance();
    MockRedis.mockImplementation(() => mockInstance as unknown as Redis);
  });

  it('creates a Redis subscriber and subscribes to the namespaced risk_alert channel', () => {
    startRiskAlertSubscriber();
    expect(mockInstance.subscribe).toHaveBeenCalledWith('aesis:risk_alert', expect.any(Function));
  });

  it('logs when subscription is established', () => {
    const { logger } = jest.requireMock('../../config/logger');
    startRiskAlertSubscriber();
    mockInstance._triggerSubscribeCallback(null, 1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('subscribed'),
      expect.any(Object),
    );
  });

  it('logs error if subscribe fails', () => {
    const { logger } = jest.requireMock('../../config/logger');
    startRiskAlertSubscriber();
    mockInstance._triggerSubscribeCallback(new Error('subscribe failed'), 0);
    expect(logger.error).toHaveBeenCalled();
  });

  it('forwards a valid risk_alert message to the supervisor via socket', () => {
    startRiskAlertSubscriber();
    const payload = { supervisorId: 'sup-1', studentId: 'stu-1', tier: 'high', factors: [] };
    mockInstance._triggerMessage('aesis:risk_alert', JSON.stringify(payload));
    expect(emitToUser).toHaveBeenCalledWith('sup-1', 'risk_alert', expect.objectContaining({ tier: 'high' }));
  });

  it('logs a warning and skips invalid JSON', () => {
    const { logger } = jest.requireMock('../../config/logger');
    startRiskAlertSubscriber();
    mockInstance._triggerMessage('aesis:risk_alert', '{invalid json}');
    expect(logger.warn).toHaveBeenCalled();
    expect(emitToUser).not.toHaveBeenCalled();
  });

  it('logs a warning and skips messages with no supervisorId', () => {
    const { logger } = jest.requireMock('../../config/logger');
    startRiskAlertSubscriber();
    mockInstance._triggerMessage('aesis:risk_alert', JSON.stringify({ studentId: 'stu-1', tier: 'low' }));
    expect(logger.warn).toHaveBeenCalled();
    expect(emitToUser).not.toHaveBeenCalled();
  });

  it('ignores messages on unrelated channels', () => {
    startRiskAlertSubscriber();
    mockInstance._triggerMessage('some_other_channel', JSON.stringify({ supervisorId: 'sup-1' }));
    expect(emitToUser).not.toHaveBeenCalled();
  });

  it('logs Redis errors', () => {
    const { logger } = jest.requireMock('../../config/logger');
    startRiskAlertSubscriber();
    mockInstance._triggerEvent('error', new Error('Redis connection lost'));
    expect(logger.error).toHaveBeenCalled();
  });
});
