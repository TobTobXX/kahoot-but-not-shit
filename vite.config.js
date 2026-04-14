import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        login: resolve(import.meta.dirname, 'login/index.html'),
        host: resolve(import.meta.dirname, 'host/index.html'),
        join: resolve(import.meta.dirname, 'join/index.html'),
        play: resolve(import.meta.dirname, 'play/index.html'),
        create: resolve(import.meta.dirname, 'create/index.html'),
        edit: resolve(import.meta.dirname, 'edit/index.html'),
        library: resolve(import.meta.dirname, 'library/index.html'),
      },
    },
  },
})
