import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The backend binds 127.0.0.1:4000 specifically — not ::1 — so the proxy target
// must be the literal IPv4 address. `localhost` resolves to ::1 first on modern
// macOS/Node and the proxy would ECONNREFUSED against a perfectly healthy server.
//
// Proxying (rather than pointing the browser straight at :4000) keeps requests
// same-origin, so dev matches a production deployment behind one reverse proxy.
const API_ORIGIN = process.env.VITE_API_ORIGIN ?? 'http://127.0.0.1:4000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API_ORIGIN,
        changeOrigin: true,
      },
    },
  },
})
