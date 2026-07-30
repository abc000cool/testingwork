import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The backend session runs its dev server on :4000 with CORS open to localhost.
// We still proxy /api in dev so the browser sees same-origin requests, which keeps
// production (reverse proxy in front of both) and development behaving identically.
const API_ORIGIN = process.env.VITE_API_ORIGIN ?? 'http://localhost:4000'

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
