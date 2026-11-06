import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The backend's CORS allow-list contains http://localhost:5173, so the dev server must stay on that port.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, host: 'localhost' },
  preview: { port: 5173, strictPort: true, host: 'localhost' },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          mui: ['@mui/material', '@emotion/react', '@emotion/styled'],
        },
      },
    },
  },
});
