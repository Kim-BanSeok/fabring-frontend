import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = {
    '/api': {
      target: env.API_PROXY_TARGET || 'http://127.0.0.1:3000',
      changeOrigin: true,
      configure(server) {
        server.on('error', (_error, _request, response) => {
          if (!response.writeHead || response.headersSent) return
          response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' })
          response.end(JSON.stringify({ success: false, error: { code: 'NETWORK_ERROR', message: '서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.' } }))
        })
      },
    },
  }
  return {
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
  build: {
    rolldownOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        reference: fileURLToPath(new URL('./html-reference.html', import.meta.url)),
      },
    },
  },
  }
})
