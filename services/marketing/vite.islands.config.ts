import { fileURLToPath } from 'node:url'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, type UserConfig } from 'vite'
import { buildDir, siteConfig } from './src/lib/site.ts'

/**
 * The Help Center's islands bundle (src/islands/client.tsx → /islands.js),
 * built after the site into the same output. It is the only JavaScript the
 * site's pages load besides public/*.js.
 */
export default defineConfig((): UserConfig => {
  const site = siteConfig(process.env.WW_SITE_ENV)
  return {
    publicDir: false,
    define: {
      'process.env.WW_SITE_ENV': JSON.stringify(site.env),
    },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    plugins: [viteReact()],
    build: {
      outDir: `${buildDir(site)}/client`,
      emptyOutDir: false,
      rolldownOptions: {
        input: 'src/islands/client.tsx',
        output: {
          entryFileNames: 'islands.js',
          chunkFileNames: 'assets/islands-[hash].js',
        },
      },
    },
  }
})
