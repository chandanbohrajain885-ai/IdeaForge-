import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Flat project: index.html and all source files live in the project root.
// There is no public/ folder; images are imported from code so Vite bundles them.
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
