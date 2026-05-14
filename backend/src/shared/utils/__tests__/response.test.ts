import { ok, created, noContent } from '../response';

function mockRes() {
  const res: Record<string, jest.Mock> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  res.send   = jest.fn().mockReturnValue(res);
  return res as unknown as import('express').Response;
}

describe('ok', () => {
  it('sends 200 with data', () => {
    const res = mockRes();
    ok(res, { id: '1' });
    expect((res as any).status).toHaveBeenCalledWith(200);
    expect((res as any).json).toHaveBeenCalledWith({ status: 'success', data: { id: '1' } });
  });

  it('includes meta when provided', () => {
    const res = mockRes();
    const meta = { total: 10, page: 1, limit: 5, totalPages: 2 };
    ok(res, [], meta);
    expect((res as any).json).toHaveBeenCalledWith({ status: 'success', data: [], meta });
  });

  it('omits meta when not provided', () => {
    const res = mockRes();
    ok(res, 'value');
    const call = (res as any).json.mock.calls[0][0];
    expect(call).not.toHaveProperty('meta');
  });
});

describe('created', () => {
  it('sends 201 with data', () => {
    const res = mockRes();
    created(res, { id: 'new' });
    expect((res as any).status).toHaveBeenCalledWith(201);
    expect((res as any).json).toHaveBeenCalledWith({ status: 'success', data: { id: 'new' } });
  });
});

describe('noContent', () => {
  it('sends 204 with no body', () => {
    const res = mockRes();
    noContent(res);
    expect((res as any).status).toHaveBeenCalledWith(204);
    expect((res as any).send).toHaveBeenCalled();
  });
});
