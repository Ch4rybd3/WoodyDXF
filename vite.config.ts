import { defineConfig } from 'vite';

// base relative : fonctionne sur https://<compte>.github.io/WoodyDXF/ comme en local
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
});
