import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { addWearModule } = require('./with-wear-os')

it('includes the Wear OS app in place, once', () => {
  const settings = "include ':app'\n"
  const once = addWearModule(settings)
  expect(once).toContain("include ':wear'")
  expect(once).toContain(
    "project(':wear').projectDir = new File(rootDir, '../targets/wear-os')"
  )
  // Repeated prebuilds don't add it again.
  expect(addWearModule(once)).toBe(once)
})
