import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// Build thành SPA tĩnh: toàn bộ route fallback về index.html, nginx serve, không cần Node runtime
		adapter: adapter({ fallback: 'index.html', strict: false })
	}
};

export default config;
