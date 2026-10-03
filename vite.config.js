import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages project sites (user.github.io/repo/).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 800 }, // three.js alone is ~600 kB
});
