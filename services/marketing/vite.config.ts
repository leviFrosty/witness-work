import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, type UserConfig } from 'vite'
import { loadHelpCenter } from './src/lib/help-center/load.ts'
import { buildDir, siteConfig } from './src/lib/site.ts'
import { sitePages } from './src/vite/pages.ts'
import { siteFiles } from './src/vite/site-files.ts'

/**
 * The website, prerendered to static files (dist/client) for Workers Static
 * Assets. WW_SITE_ENV=dev builds the staging site (src/lib/site.ts).
 */
export default defineConfig(async ({ command }): Promise<UserConfig> => {
  const site = siteConfig(process.env.WW_SITE_ENV)
  const center = await loadHelpCenter()
  return {
    define: {
      'process.env.WW_SITE_ENV': JSON.stringify(site.env),
    },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // The built server only runs at build time, to prerender, from dist/.
    // Bundling everything into it keeps Node from resolving a package from
    // the app's node_modules at the repo root. (The dev server resolves from
    // the source files, so it doesn't need this.)
    ...(command === 'build' && { ssr: { noExternal: true } }),
    build: {
      outDir: buildDir(site),
      // Fonts and images stay files: the Content-Security-Policy allows no
      // data: fonts (src/lib/site-files.ts).
      assetsInlineLimit: 0,
    },
    plugins: [
      siteFiles(),
      tanstackStart({
        prerender: {
          enabled: true,
          crawlLinks: false,
          autoSubfolderIndex: false,
          failOnError: true,
        },
        pages: sitePages(center).map((path) => ({ path })),
      }),
      viteReact(),
      tailwindcss(),
    ],
  }
})
