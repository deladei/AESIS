import { Request, Response, NextFunction } from 'express';
import { ZodError, z } from 'zod';
import { globalErrorHandler, AppError, asyncHandler } from '../errorHandler';

jest.mock('../../config/logger', () => ({
  logger: { error: jest.fn() },
}));

function mockRes() {
  const res: Record<string, jest.Mock> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res as unknown as Response;
}

const fakeReq = { path: '/test', method: 'GET' } as Request;
const fakeNext = jest.fn() as NextFunction;

afterEach(() => jest.clearAllMocks());

describe('globalErrorHandler', () => {
  it('handles ZodError with 400', () => {
    const res = mockRes();
    let zodErr: ZodError;
    try { z.object({ name: z.string() }).parse({}); }
    catch (e) { zodErr = e as ZodError; }

    globalErrorHandler(zodErr!, fakeReq, res, fakeNext);

    expect((res as any).status).toHaveBeenCalledWith(400);
    expect((res as any).json.mock.calls[0][0]).toHaveProperty('code', 'VALIDATION_ERROR');
  });

  it('handles AppError (4xx) with correct status', () => {
    const res = mockRes();
    const err = new AppError(404, 'Not found');

    globalErrorHandler(err, fakeReq, res, fakeNext);

    expect((res as any).status).toHaveBeenCalledWith(404);
    expect((res as any).json.mock.calls[0][0]).toMatchObject({
      status:  'error',
      code:    'ERROR',
      message: 'Not found',
    });
  });

  it('handles AppError (5xx) and logs it', () => {
    const res = mockRes();
    const err = new AppError(503, 'Service unavailable', 'SERVICE_DOWN');
    const { logger } = jest.requireMock('../../config/logger');

    globalErrorHandler(err, fakeReq, res, fakeNext);

    expect((res as any).status).toHaveBeenCalledWith(503);
    expect(logger.error).toHaveBeenCalled();
    expect((res as any).json.mock.calls[0][0]).toMatchObject({ code: 'SERVICE_DOWN' });
  });

  it('uses AppError.code when provided', () => {
    const res = mockRes();
    const err = new AppError(401, 'Unauthorized', 'AUTH_REQUIRED');

    globalErrorHandler(err, fakeReq, res, fakeNext);

    expect((res as any).json.mock.calls[0][0]).toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('handles unknown Error with 500 and logs', () => {
    const res  = mockRes();
    const err  = new Error('Something went wrong');
    const { logger } = jest.requireMock('../../config/logger');

    globalErrorHandler(err, fakeReq, res, fakeNext);

    expect((res as any).status).toHaveBeenCalledWith(500);
    expect(logger.error).toHaveBeenCalled();
    expect((res as any).json.mock.calls[0][0]).toHaveProperty('code', 'INTERNAL_SERVER_ERROR');
  });

  it('handles non-Error values with 500', () => {
    const res = mockRes();
    const { logger } = jest.requireMock('../../config/logger');

    globalErrorHandler('raw string error', fakeReq, res, fakeNext);

    expect((res as any).status).toHaveBeenCalledWith(500);
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('asyncHandler', () => {
  it('calls next with error when the wrapped function rejects', async () => {
    const err     = new Error('async failure');
    const handler = jest.fn().mockRejectedValue(err);
    const next    = jest.fn();
    const wrapped = asyncHandler(handler);

    await wrapped(fakeReq, mockRes(), next);

    expect(next).toHaveBeenCalledWith(err);
  });

  it('does not call next when the wrapped function resolves', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const next    = jest.fn();
    const wrapped = asyncHandler(handler);

    await wrapped(fakeReq, mockRes(), next);

    expect(next).not.toHaveBeenCalled();
  });
});
