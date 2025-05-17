// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
	plugins: [
		react({
			jsxRuntime: 'automatic',
			// fastRefresh: true,
		}),
		tailwindcss(),
	],
	server: {
		port: 3000
	},
	css: {
		devSourcemap: true,
	},
});

