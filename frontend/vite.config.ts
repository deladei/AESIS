import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Validation schemas are defined ONCE and shared verbatim with the API.
      // They live under backend/src because the backend compiles with
      // rootDir: ./src and starts as `node dist/server.js` — a repo-root folder
      // would shift the dist layout and break the Render start command. The
      // bundler has no such constraint, so the SPA reaches in. The folder
      // imports nothing but zod, so no server code follows it into the bundle.
      // Points at the barrel file, not the directory — Rollup does not do
      // directory-index resolution for an aliased bare specifier.
      '@shared': path.resolve(__dirname, '../backend/src/shared/validation/index.ts'),
    },
  },
  server: {
    port: 5173,
    ...(mode === 'development' && {
      proxy: {
        '/api':       { target: 'http://localhost:3002', changeOrigin: true },
        '/socket.io': { target: 'http://localhost:3002', changeOrigin: true, ws: true },
      },
    }),
  },
}));
