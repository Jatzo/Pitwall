import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Relative base so the build works on GitHub Pages under any repository name.
  base: './',
  build: { target: 'es2022', sourcemap: true },
});
