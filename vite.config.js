import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  server: {
    headers: {
      'Cache-Control': 'no-store',
    },
    allowedHosts: [
      '3fe4-2400-74e0-0-58f-9107-8d2c-999e-9310.ngrok-free.app'
    ]
  },
  plugins: [react(), tailwindcss(), cloudflare()],
})