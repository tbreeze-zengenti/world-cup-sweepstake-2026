import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Serve the organiser-edited JSON data files at the site root
  // (e.g. /matches.json) in dev and copy them into dist/ on build.
  publicDir: 'data',
})
