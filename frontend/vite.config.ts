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
