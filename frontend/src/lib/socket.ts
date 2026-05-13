import { io, type Socket } from 'socket.io-client';

let _socket: Socket | null = null;

export function initSocket(accessToken: string): Socket {
  if (_socket?.connected) return _socket;

  _socket = io('/', {
    auth:            { token: accessToken },
    path:            '/socket.io',
    transports:      ['websocket', 'polling'],
    autoConnect:     true,
    reconnection:    true,
    reconnectionDelay: 1000,
  });

  return _socket;
}

export function getSocket(): Socket | null { return _socket; }

export function disconnectSocket() {
  _socket?.disconnect();
  _socket = null;
}
