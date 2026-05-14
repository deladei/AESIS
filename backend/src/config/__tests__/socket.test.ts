import { setIo, getIo } from '../socket';

describe('socket singleton', () => {
  it('throws when getIo is called before setIo', () => {
    // Module state carries across tests — reset by re-importing via jest.resetModules if needed,
    // but here we test the throw path first, then set, then get.
    expect(() => getIo()).toThrow('Socket.io not initialised');
  });

  it('returns the io instance after setIo is called', () => {
    const fakeIo = { to: jest.fn() } as unknown as import('socket.io').Server;
    setIo(fakeIo);
    expect(getIo()).toBe(fakeIo);
  });
});
