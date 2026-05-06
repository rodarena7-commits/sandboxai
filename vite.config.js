import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/analizar': {
        target: 'https://sandboxai.onrender.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path // Mantiene la ruta /analizar
      }
    }
  },
  // Configuración para producción en Vercel
  preview: {
    proxy: {
      '/analizar': {
        target: 'https://sandboxai.onrender.com',
        changeOrigin: true
      }
    }
  }
})
