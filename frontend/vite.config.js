import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: {
    cssTarget: 'chrome61' // Prevent esbuild from using modern CSS syntax like width<=800px which breaks older Android WebViews
  }
})
