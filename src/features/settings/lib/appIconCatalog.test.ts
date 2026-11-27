import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-alternate-app-icons', () => ({
  getAppIconName: vi.fn(),
  setAlternateAppIcon: vi.fn(),
  supportsAlternateIcons: true,
}))
vi.mock('expo-location', () => ({}))
vi.mock('expo-localization', () => ({ getLocales: () => [] }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: { getState: () => ({}) },
}))

const { APP_ICON_GROUPS, isAlternateAppIcon } = await import(
  '@/features/settings/lib/appIconCatalog'
)
const { resolvePluginIcon } = await import('@/features/settings/lib/appIcon')

const iconsDir = join(__dirname, '..', '..', '..', 'assets', 'icons')
const pngNames = (dir: string) =>
  readdirSync(dir)
    .filter((file) => file.endsWith('.png'))
    .map((file) => file.slice(0, -'.png'.length))
    .sort()

const offered = APP_ICON_GROUPS.flatMap((group) =>
  group.options.map((option) => option.variant)
)

describe('app icon catalog', () => {
  it('offers every alternate icon the app registers, once', () => {
    const alternates = offered.filter(
      (v) => v !== 'Default' && v !== 'Seasonal'
    )
    expect([...alternates].sort()).toEqual(pngNames(iconsDir))
    expect(new Set(offered).size).toBe(offered.length)
  })

  it('has a picker preview for every icon', () => {
    expect(pngNames(join(iconsDir, 'previews'))).toEqual(pngNames(iconsDir))
  })
})

describe('resolvePluginIcon', () => {
  it('uses the app icon for Default', () => {
    expect(resolvePluginIcon('Default', 'north')).toBeNull()
    expect(resolvePluginIcon(null, 'north')).toBeNull()
  })

  it('picks the season for Seasonal', () => {
    const july = new Date(2026, 6, 1)
    expect(resolvePluginIcon('Seasonal', 'north', july)).toBe('SeasonalSummer')
    expect(resolvePluginIcon('Seasonal', 'south', july)).toBe('SeasonalWinter')
  })

  it('names the chosen icon', () => {
    expect(resolvePluginIcon('Neon', 'north')).toBe('Neon')
  })

  it('falls back to the app icon for an icon this version lacks', () => {
    const fromNewerVersion = 'Holographic' as Parameters<
      typeof resolvePluginIcon
    >[0]
    expect(isAlternateAppIcon('Holographic')).toBe(false)
    expect(resolvePluginIcon(fromNewerVersion, 'north')).toBeNull()
  })
})
