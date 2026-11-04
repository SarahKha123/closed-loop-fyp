import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      // The backend, in dev. `./closed-loop.sh dev` sets CLOSED_LOOP_API_URL
      // to its BACKEND_PORT; a plain `pnpm dev` assumes :8000.
      // xfwd: pass the browser's IP on (X-Forwarded-For), so the sign-in audit log records it, not the proxy's.
      '/api': { target: process.env.CLOSED_LOOP_API_URL ?? 'http://localhost:8000', xfwd: true },
    },
  },
})
