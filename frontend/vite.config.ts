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
      '/api': process.env.CLOSED_LOOP_API_URL ?? 'http://localhost:8000',
    },
  },
})
