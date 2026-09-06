import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Validation schemas are authored ONCE in backend/src/shared/validation
      // and mirrored here by scripts/sync-shared.mjs. The mirror exists because
      // Vercel's Root Directory is frontend/ — nothing above it is in the build
      // context, so importing across the repo works locally and fails in
      // production. `npm run sync:shared -- --check` guards against drift.
      '@shared': path.resolve(__dirname, './src/shared/validation/index.ts'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Recharts is ~400 kB and, until the dashboards were rebuilt, it was a
        // dependency nothing imported. Splitting it keeps it out of the main
        // bundle's cache line, so a change to app code no longer forces every
        // viewer to re-download the charting library.
        manualChunks: {
          recharts: ['recharts'],
        },
      },
    },
  },
  // `vite preview` serves the production build. It needs the same API proxy the
  // dev server has, or the built SPA can only be exercised against a deployed
  // backend — which is exactly when you most want to check it locally.
  preview: {
    port: 5173,
    proxy: {
      '/api':       { target: 'http://127.0.0.1:3002', changeOrigin: true },
      '/socket.io': { target: 'http://127.0.0.1:3002', changeOrigin: true, ws: true },
    },
  },
  server: {
    port: 5173,
    ...(mode === 'development' && {
      // 127.0.0.1, never `localhost`: on a host where `localhost` resolves to
      // ::1 first and the API is listening on IPv4 only, every proxied request
      // fails with ECONNREFUSED and the SPA looks like a backend outage.
      proxy: {
        '/api':       { target: 'http://127.0.0.1:3002', changeOrigin: true },
        '/socket.io': { target: 'http://127.0.0.1:3002', changeOrigin: true, ws: true },
      },
    }),
  },
}));
