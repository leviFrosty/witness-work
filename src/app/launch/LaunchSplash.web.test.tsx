import fs from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import enUS from '@/locales/en-US.json'
import { SPLASH_BACKGROUND_COLOR } from '@/constants/brandMark'
import LaunchSplash, { splashMarkWidth } from './LaunchSplash.web'

vi.mock('react-native', () => ({
  Platform: {
    select: (options: { web?: unknown; default?: unknown }) =>
      options.web ?? options.default,
  },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}))
vi.mock('@/lib/locales', async () => {
  const strings: Record<string, unknown> = (
    await import('@/locales/en-US.json')
  ).default
  return { default: { t: (key: string) => String(strings[key]) } }
})

const page = fs.readFileSync(
  new URL('../../../public/index.html', import.meta.url),
  'utf8'
)
const pageSplash = /<div id="root">([\s\S]*?)<\/div>\s*<!--/
  .exec(page)![1]
  .replace(/\s+/g, ' ')
  .replace(/> </g, '><')
  .replace(/ >/g, '>')
  .trim()

describe('the web launch splash', () => {
  it('renders the markup the page already shows, so the app’s first render changes nothing', () => {
    const rendered = renderToStaticMarkup(<LaunchSplash />)
    expect(rendered.replace(/ style="[^"]*"/, '')).toBe(
      pageSplash.replace(' id="launch-splash-progress"', '')
    )
  })

  it('sizes the mark as the page’s styles do', () => {
    expect(splashMarkWidth({ width: 1284, height: 2778 })).toBe(235)
    expect(renderToStaticMarkup(<LaunchSplash />)).toContain(
      `style="width:${235 * (390 / 1284)}px;`
    )
    expect(page).toContain(
      'width: min(calc(100vw * 235 / 1284), calc(100dvh * 235 / 2778));'
    )
    expect(page).toContain(
      `background-color: ${SPLASH_BACKGROUND_COLOR.toLowerCase()};`
    )
  })

  it('names the progress bar, in English until a script can say otherwise', () => {
    expect(pageSplash).toContain(
      `role="progressbar" aria-label="${enUS.common_loading}"`
    )
  })

  it('shows no progress bar where nothing is loading', () => {
    const rendered = renderToStaticMarkup(<LaunchSplash indicator={false} />)
    expect(rendered).toContain('launch-splash-mark')
    expect(rendered).not.toContain('progressbar')
  })
})
