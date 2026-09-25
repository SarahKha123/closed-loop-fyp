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
      // The backend, in dev. `CLOSED_LOOP_API_URL` is set by
      // docker-compose.dev.yml's frontend service (the service name resolves
      // there); the default is a plain `npm run dev` on the host, where the
      // backend is either the container stack's published port or
      // `./closed-loop.sh dev --host` running uvicorn directly.
      '/api': process.env.CLOSED_LOOP_API_URL ?? 'http://localhost:8000',
    },
  },
})
