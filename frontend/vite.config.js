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
        // chunks keep their filenames across deployments and stay cached.
        //
        // Written as a function rather than the object form: rolldown, which
        // Vite 8 builds with, accepts only this shape.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;

          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)/.test(id)) {
            return 'react-vendor';
          }
          if (/[\\/]node_modules[\\/](axios|react-toastify)/.test(id)) {
            return 'vendor';
          }
          return undefined;
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
