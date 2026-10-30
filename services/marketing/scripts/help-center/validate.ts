/**
 * Validates Help Center content and writes the generated files (bundles,
 * Markdown alternates, llms.txt, sitemap, robots.txt, _headers) into public/.
 * The site build runs the same step.
 *
 * Run it with `pnpm help:validate`.
 */
import { generateSiteFiles } from '../../src/vite/site-files.ts'
import { HelpCenterError } from '../../src/lib/help-center/load.ts'

try {
  const { center, manifest } = await generateSiteFiles()
  const locales = Object.entries(manifest.locales)
  console.log(
    `Help Center OK: ${center.questions.length} questions, ${center.categories.length} categories, ${locales.length} locales.`
  )
} catch (error) {
  if (error instanceof HelpCenterError) {
    console.error(error.message)
    process.exit(1)
  }
  throw error
}
