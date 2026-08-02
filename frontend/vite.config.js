import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // The framework changes when a dependency is upgraded; the application
        // changes whenever anything is deployed. Bundled together, every
        // deployment invalidates the browser's copy of React as well, and a
        // returning user downloads all of it again. Split apart, the vendor
        // chunk keeps its filename across deployments and stays cached.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          vendor: ['axios', 'react-toastify'],
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
