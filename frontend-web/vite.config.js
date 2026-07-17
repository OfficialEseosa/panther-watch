import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envDir: './env', // Look for .env files in the env directory
  build: {
    rollupOptions: {
      output: {
        // Split the big stable libraries into their own cacheable chunks so
        // app code changes don't force users to re-download React/framer.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'framer-motion': ['framer-motion']
        }
      }
    }
  }
})
