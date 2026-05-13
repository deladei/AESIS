import { Server as SocketServer } from 'socket.io';

let _io: SocketServer | null = null;

export function setIo(io: SocketServer): void {
  _io = io;
}

export function getIo(): SocketServer {
  if (!_io) throw new Error('Socket.io not initialised — call setIo() during bootstrap');
  return _io;
}
