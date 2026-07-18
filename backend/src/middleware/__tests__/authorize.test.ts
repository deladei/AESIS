import { Request, Response, NextFunction } from 'express';
import { authorize } from '../authorize';

function makeReq(user?: { sub: string; role: string }): Request {
  return { user } as unknown as Request;
}

const fakeRes = {} as Response;

function makeNext(): NextFunction {
  return jest.fn() as NextFunction;
}

describe('authorize middleware', () => {
  it('throws 401 when req.user is not set', () => {
    const guard = authorize('student');
    expect(() => guard(makeReq(undefined), fakeRes, makeNext())).toThrow('Not authenticated');
  });

  it('throws 403 when user role is not in allowed list', () => {
    const guard = authorize('coordinator', 'admin');
    const req   = makeReq({ sub: 'uid', role: 'student' });
    expect(() => guard(req, fakeRes, makeNext())).toThrow('Insufficient permissions');
  });

  it('calls next when role is allowed', () => {
    const guard = authorize('student', 'coordinator');
    const req   = makeReq({ sub: 'uid', role: 'student' });
    const next  = makeNext();

    guard(req, fakeRes, next);

    expect(next).toHaveBeenCalled();
  });

  it('allows coordinator when listed', () => {
    const guard = authorize('coordinator');
    const req   = makeReq({ sub: 'uid', role: 'coordinator' });
    const next  = makeNext();

    guard(req, fakeRes, next);

    expect(next).toHaveBeenCalled();
  });

  it('allows admin when listed', () => {
    const guard = authorize('admin');
    const req   = makeReq({ sub: 'uid', role: 'admin' });
    const next  = makeNext();

    guard(req, fakeRes, next);

    expect(next).toHaveBeenCalled();
  });

  it('hod satisfies a coordinator-gated route', () => {
    const guard = authorize('coordinator', 'admin');
    const req   = makeReq({ sub: 'uid', role: 'hod' });
    const next  = makeNext();

    guard(req, fakeRes, next);

    expect(next).toHaveBeenCalled();
  });

  it('coordinator does NOT satisfy an hod-only route', () => {
    const guard = authorize('hod', 'admin');
    const req   = makeReq({ sub: 'uid', role: 'coordinator' });
    expect(() => guard(req, fakeRes, makeNext())).toThrow('Insufficient permissions');
  });

  it('hod does not inherit non-coordinator roles', () => {
    const guard = authorize('student', 'academic_supervisor');
    const req   = makeReq({ sub: 'uid', role: 'hod' });
    expect(() => guard(req, fakeRes, makeNext())).toThrow('Insufficient permissions');
  });
});
