import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import symbols from '../src/assets/android-menu-icons/symbols.json'

const require = createRequire(import.meta.url)
const withAndroidMenuIcons = require('./with-android-menu-icons')

it('packages every mapped drawable, preserves unrelated resources, and keeps icons in release builds', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'ww-menu-icons-'))
  try {
    const platformProjectRoot = path.join(projectRoot, 'android')
    const res = path.join(platformProjectRoot, 'app/src/main/res')
    await mkdir(path.join(res, 'drawable'), { recursive: true })
    await writeFile(path.join(res, 'drawable/unrelated.xml'), 'preserved')
    const config = withAndroidMenuIcons({ name: 'test', slug: 'test' })
    const run = () =>
      config.mods.android.dangerous({
        ...config,
        modResults: {},
        modRequest: { projectRoot, platformProjectRoot, platform: 'android' },
      })
    await run()
    // Repeated prebuilds must leave the same resources intact.
    await run()
    const keep = await readFile(
      path.join(res, 'raw/ww_menu_icons_keep.xml'),
      'utf8'
    )
    for (const name of Object.values(symbols)) {
      const packaged = await readFile(
        path.join(res, 'drawable', `${name}.xml`),
        'utf8'
      )
      const source = await readFile(
        new URL(
          `../src/assets/android-menu-icons/${name}.xml`,
          import.meta.url
        ),
        'utf8'
      )
      expect(packaged).toBe(source)
      expect(keep).toContain(`@drawable/${name}`)
    }
    expect(
      await readFile(path.join(res, 'drawable/unrelated.xml'), 'utf8')
    ).toBe('preserved')
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})
