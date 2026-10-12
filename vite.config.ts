import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Dev-only proxy so the browser calls a relative path in dev and in production.
// In production the same path is served by the Cloudflare Worker in proxy/.
// The key lives in the shell environment for dev (ANTHROPIC_API_KEY), never in VITE_* vars.
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
      '@bank': fileURLToPath(new URL('./bank', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/anthropic/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            const key = process.env.ANTHROPIC_API_KEY
            if (key) proxyReq.setHeader('x-api-key', key)
            proxyReq.setHeader('anthropic-version', '2023-06-01')
          })
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'bank/**/*.test.ts', 'proxy/**/*.test.ts'],
  },
})
