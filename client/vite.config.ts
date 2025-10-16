import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true
      },
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
        changeOrigin: true
      }
    }
  }
})
