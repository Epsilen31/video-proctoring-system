import path from 'node:path';

import react from '@vitejs/plugin-react-swc';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 5173,
      host: '0.0.0.0',
      open: mode === 'development',
    },
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
      __FOCUS_ENV__: JSON.stringify(env),
    },
  };
});
