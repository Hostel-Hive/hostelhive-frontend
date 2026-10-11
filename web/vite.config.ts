import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { parseEnvironment } from './src/config/env.ts';

export default defineConfig(({ mode }) => {
  // Validate before serving or building, including values supplied by CI.
  const { apiBaseUrl } = parseEnvironment(
    loadEnv(mode, process.cwd(), 'VITE_'),
  );

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/backend-api': {
          target: apiBaseUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/backend-api/, ''),
        },
      },
    },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  };
});
