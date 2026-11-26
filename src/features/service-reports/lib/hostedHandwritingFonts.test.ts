import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { HOSTED_HANDWRITING_FONTS } from './hostedHandwritingFonts'

const SITE_FONTS = 'services/marketing/public/fonts/handwriting'

describe('hosted handwriting fonts', () => {
  it.each(Object.entries(HOSTED_HANDWRITING_FONTS))(
    '%s is a file the website serves, with its license beside it',
    (_family, file) => {
      expect(existsSync(path.join(SITE_FONTS, file))).toBe(true)
      expect(
        existsSync(path.join(SITE_FONTS, path.dirname(file), 'OFL.txt'))
      ).toBe(true)
    }
  )
})
