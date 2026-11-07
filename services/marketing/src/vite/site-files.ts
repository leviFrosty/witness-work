import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'
import { generateHelpCenterAssets } from '../lib/help-center/generate.ts'
import { HELP_CONTENT_DIR } from '../lib/help-center/load.ts'
import { headersFile, robotsTxt, sitemapXml } from '../lib/site-files.ts'

export const SITE_FILES = [
  'public/robots.txt',
  'public/sitemap.xml',
  'public/_headers',
]

export async function generateSiteFiles(root: string = process.cwd()) {
  const result = await generateHelpCenterAssets(root)
  const write = async (file: string, contents: string) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), contents)
  }
  await write('public/robots.txt', robotsTxt())
  await write('public/sitemap.xml', sitemapXml(result.center))
  await write('public/_headers', headersFile())
  return result
}

export function siteFiles(): Plugin {
  let generated: Promise<unknown> | undefined
  return {
    name: 'ww:site-files',
    async config(_config, { command }) {
      generated ??= generateSiteFiles()
      if (command === 'build') {
        await generated
      } else {
        await generated.catch((error: Error) => console.error(error.message))
      }
    },
    configureServer(server) {
      const contentDir = path.resolve(HELP_CONTENT_DIR)
      server.watcher.add(contentDir)
      let timer: ReturnType<typeof setTimeout> | undefined
      server.watcher.on('all', (_event, file) => {
        if (!file.startsWith(contentDir)) return
        clearTimeout(timer)
        timer = setTimeout(() => {
          generateSiteFiles().catch((error: Error) =>
            console.error(error.message)
          )
        }, 200)
      })
    },
  }
}
