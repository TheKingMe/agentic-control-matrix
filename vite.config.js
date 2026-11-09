import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: true,
    cors: true
  },
  assetsInclude: ['**/*.task', '**/*.wasm', '**/*.glb', '**/*.mp4']
});
