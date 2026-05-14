jest.mock('../../../config/socket', () => ({
  getIo: jest.fn(),
}));

jest.mock('../../../config/logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn() },
}));

import { emitToUser } from '../socketEmitter';
import { getIo } from '../../../config/socket';

const mockGetIo = getIo as jest.Mock;

describe('emitToUser', () => {
  afterEach(() => jest.clearAllMocks());

  it('emits to the user room when socket is ready', () => {
    const mockEmit = jest.fn();
    const mockTo   = jest.fn().mockReturnValue({ emit: mockEmit });
    mockGetIo.mockReturnValue({ to: mockTo });

    emitToUser('user-1', 'notification:new', { id: 'n1' });

    expect(mockTo).toHaveBeenCalledWith('user:user-1');
    expect(mockEmit).toHaveBeenCalledWith('notification:new', { id: 'n1' });
  });

  it('logs a warning instead of throwing when socket is not ready', () => {
    mockGetIo.mockImplementation(() => { throw new Error('Socket not initialised'); });

    const { logger } = jest.requireMock('../../../config/logger');

    expect(() => emitToUser('user-1', 'test', {})).not.toThrow();
    expect(logger.warn).toHaveBeenCalled();
  });
});
