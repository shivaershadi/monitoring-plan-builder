import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Static site: relative base so the bundle works under any path, including
// https://<account>.github.io/<repository>/. No dev proxy, no server-side code.
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
      '@bank': fileURLToPath(new URL('./bank', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'bank/**/*.test.ts'],
  },
})
