import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// Resolve @ascii-motion/premium to the real package when the submodule is
// initialised, or to a lightweight stub when it is absent (OSS contributors).
const premiumSrc = path.resolve(__dirname, './packages/premium/src/index.ts')
const premiumAlias = fs.existsSync(premiumSrc)
  ? path.resolve(__dirname, './packages/premium/src')
  : path.resolve(__dirname, './src/lib/premium-stub.ts')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@ascii-motion/core": path.resolve(__dirname, "./packages/core/src"),
      "@ascii-motion/premium": premiumAlias,
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@ffmpeg/core']
  },
  build: {
    // Optimize for Vercel deployment
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate FFmpeg into its own chunk for better loading
          ffmpeg: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@ffmpeg/core'],
          // Separate large UI library chunks
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select'],
          vendor: ['react', 'react-dom', 'zustand'],
        },
      },
    },
  },
  server: {
    headers: {
      // No COEP in development - allows Vimeo/YouTube iframes to work
      // FFmpeg video export won't work in dev, test in production instead
      // Production uses COEP: credentialless which supports both
    },
    hmr: {
      // Increase timeout to prevent disconnection when tab is inactive
      timeout: 30000, // 30 seconds instead of default ~5 seconds
      overlay: true,
    },
  },
})
