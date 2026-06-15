import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Backend API chạy ở box riêng. Khi dev, proxy /api sang API service local (cổng 3000)
// để giữ cookie first-party. Production: nginx lo việc proxy này.
const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		port: 5173,
		proxy: {
			'/api': { target: API_TARGET, changeOrigin: true }
		}
	}
});
