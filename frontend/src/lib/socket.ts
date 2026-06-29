import { io, type Socket } from 'socket.io-client';

let _socket: Socket | null = null;

// The Socket.io server runs on the backend (Render), NOT the Vercel SPA origin.
// Target the backend root explicitly: prefer VITE_SOCKET_URL, fall back to the
// API origin (VITE_API_BASE_URL), and only use a relative '/' in local dev where
// Vite proxies to the backend. Without this the client tries
// wss://<vercel-host>/socket.io — which has no WS server — and retries forever.
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  '/';

export function initSocket(accessToken: string): Socket {
  if (_socket?.connected) return _socket;

  _socket = io(SOCKET_URL, {
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
