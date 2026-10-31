import fs from 'node:fs'
import path from 'node:path'
import { parse } from '@babel/parser'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  scrubAddress,
  scrubLaunchAddress,
} from '@/app/launch/scrubLaunchAddress.web'
import {
  devBuyGateOverride,
  devCountryOverride,
  forwardedReturn,
  returnedAppUserId,
  setLaunchAddress,
} from '@/lib/launchAddress'

const ID = 'ww_buyer_0123456789'

/** A page's `location` and `history`, recording what the entry did to them. */
const page = (href: string) => {
  const url = new URL(href)
  const location = {
    href,
    origin: url.origin,
    hostname: url.hostname,
    replace: vi.fn(),
  }
  const history = { state: { key: 1 }, replaceState: vi.fn() }
  return {
    location,
    history,
    window: { location, history } as unknown as Pick<
      Window,
      'location' | 'history'
    >,
  }
}

beforeEach(() => {
  setLaunchAddress({
    returnedAppUserId: null,
    forwardedReturn: false,
    devCountry: null,
    devBuyGate: false,
  })
})

describe('scrubLaunchAddress', () => {
  it('takes the ids out of the address and keeps the app_user_id in memory', () => {
    const { window, location, history } = page(
      `https://app.witnesswork.app/supporter/thank-you?tier=supporter&app_user_id=${ID}&redeem_url=x`
    )
    expect(scrubLaunchAddress(window, 'production')).toBe(true)
    expect(history.replaceState).toHaveBeenCalledWith(
      { key: 1 },
      '',
      'https://app.witnesswork.app/supporter/thank-you?tier=supporter'
    )
    expect(location.replace).not.toHaveBeenCalled()
    expect(returnedAppUserId()).toBe(ID)
  })

  it('leaves an address without ids alone', () => {
    const { window, history } = page('https://app.witnesswork.app/schedule')
    expect(scrubLaunchAddress(window, 'production')).toBe(true)
    expect(history.replaceState).not.toHaveBeenCalled()
    expect(returnedAppUserId()).toBeNull()
  })

  it('forwards a return for another origin and loads nothing, keeping no id', () => {
    const { window, location, history } = page(
      `https://app.witnesswork.app/supporter/thank-you?tier=tip&utm_content=beta&app_user_id=${ID}`
    )
    expect(scrubLaunchAddress(window, 'production')).toBe(false)
    expect(location.replace).toHaveBeenCalledWith(
      'https://beta.app.witnesswork.app/supporter/thank-you?tier=tip&forwarded=1'
    )
    expect(history.replaceState).not.toHaveBeenCalled()
    expect(returnedAppUserId()).toBeNull()
  })

  it('notes a return forwarded from another origin, and takes the mark out', () => {
    const { window, history } = page(
      'https://beta.app.witnesswork.app/supporter/thank-you?tier=tip&forwarded=1'
    )
    expect(scrubLaunchAddress(window, 'beta')).toBe(true)
    expect(history.replaceState).toHaveBeenCalledWith(
      { key: 1 },
      '',
      'https://beta.app.witnesswork.app/supporter/thank-you?tier=tip'
    )
    expect(forwardedReturn()).toBe(true)
    expect(returnedAppUserId()).toBeNull()
  })

  it('honors dev_country only in a development build on localhost', () => {
    const local = page('http://localhost:8081/?dev_country=gb')
    expect(scrubLaunchAddress(local.window, 'development')).toBe(true)
    expect(devCountryOverride()).toBe('gb')
    expect(local.history.replaceState).toHaveBeenCalledWith(
      { key: 1 },
      '',
      'http://localhost:8081/'
    )
  })

  it('honors dev_buy_gate only in a development build on localhost', () => {
    const local = page('http://127.0.0.1:8765/?dev_buy_gate=1')
    expect(scrubLaunchAddress(local.window, 'development')).toBe(true)
    expect(devBuyGateOverride()).toBe(true)
    expect(local.history.replaceState).toHaveBeenCalledWith(
      { key: 1 },
      '',
      'http://127.0.0.1:8765/'
    )
  })

  it.each([
    ['production', 'http://localhost:8081/?dev_buy_gate=1'],
    ['development', 'https://app-dev.witnesswork.app/?dev_buy_gate=1'],
  ] as const)(
    'ignores dev_buy_gate in %s at %s, and removes it',
    (variant, href) => {
      const { window, history } = page(href)
      scrubLaunchAddress(window, variant)
      expect(devBuyGateOverride()).toBe(false)
      expect(history.replaceState).toHaveBeenCalledWith(
        { key: 1 },
        '',
        href.replace('?dev_buy_gate=1', '')
      )
    }
  )

  it.each([
    ['production', 'http://localhost:8081/?dev_country=GB'],
    ['beta', 'http://127.0.0.1:8081/?dev_country=GB'],
    ['development', 'https://app-dev.witnesswork.app/?dev_country=GB'],
  ] as const)(
    'ignores dev_country in %s at %s, and removes it',
    (variant, href) => {
      const { window, history } = page(href)
      scrubLaunchAddress(window, variant)
      expect(devCountryOverride()).toBeNull()
      expect(history.replaceState).toHaveBeenCalledWith(
        { key: 1 },
        '',
        href.replace('?dev_country=GB', '')
      )
    }
  )
})

describe('scrubAddress', () => {
  it('removes dev_country and checkout ids together', () => {
    expect(
      scrubAddress(
        {
          href: `http://127.0.0.1:8081/supporter/thank-you?tier=tip&dev_country=MX&app_user_id=${ID}`,
          origin: 'http://127.0.0.1:8081',
          hostname: '127.0.0.1',
        },
        'development'
      )
    ).toEqual({
      forwardTo: null,
      url: 'http://127.0.0.1:8081/supporter/thank-you?tier=tip',
      appUserId: ID,
      forwarded: false,
      devCountry: 'MX',
      devBuyGate: false,
    })
  })
})

describe('the web entry', () => {
  // `src/index.js` runs the scrub before it requires anything else, and
  // requires everything else only when the page isn't leaving.
  const entry = parse(
    fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8'),
    { sourceType: 'script' }
  ).program.body

  it('scrubs the address before any other module loads', () => {
    expect(entry).toHaveLength(2)
    const [first, second] = entry
    expect(
      fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8')
    ).not.toMatch(/^import /m)
    expect(first.type).toBe('VariableDeclaration')
    const source = JSON.stringify(first)
    expect(source).toContain('"value":"./app/launch/scrubLaunchAddress"')
    expect(second.type).toBe('IfStatement')
    const test =
      second.type === 'IfStatement' && second.test.type === 'CallExpression'
        ? second.test.callee
        : null
    expect(test).toMatchObject({
      type: 'Identifier',
      name: 'scrubLaunchAddress',
    })
    // Launch links, analytics and Skia all load inside the `if`.
    const inside = JSON.stringify(second)
    for (const module of [
      'react-native-gesture-handler',
      './app/launch/beforeAppLoads',
      './app/launch/recordLaunchLinks',
      './app/App',
    ])
      expect(inside).toContain(`"value":"${module}"`)
  })
})

describe('the scrub’s imports', () => {
  const src = path.join(__dirname, '../..')
  // As the web bundle resolves them: a `.web` file first.
  const EXTENSIONS = ['.web.ts', '.web.tsx', '.ts', '.tsx', '.web.js', '.js']
  const resolve = (from: string, specifier: string): string | null => {
    const base = specifier.startsWith('@/')
      ? path.join(src, specifier.slice(2))
      : specifier.startsWith('.')
        ? path.resolve(path.dirname(from), specifier)
        : null
    if (!base) return null
    for (const candidate of [
      ...EXTENSIONS.map((ext) => base + ext),
      ...EXTENSIONS.map((ext) => path.join(base, `index${ext}`)),
    ])
      if (fs.existsSync(candidate)) return candidate
    throw new Error(`can't resolve ${specifier} from ${from}`)
  }

  /** Every module and package the web scrub loads, following runtime imports. */
  const graph = (entry: string) => {
    const files = new Set<string>()
    const packages = new Set<string>()
    const visit = (file: string) => {
      if (files.has(file)) return
      files.add(file)
      const ast = parse(fs.readFileSync(file, 'utf8'), {
        sourceType: 'module',
        plugins: ['typescript', 'jsx'],
      })
      const specifiers: string[] = []
      for (const node of ast.program.body) {
        // Type-only imports and exports are erased.
        if (node.type === 'ImportDeclaration' && node.importKind !== 'type')
          specifiers.push(node.source.value)
        if (
          (node.type === 'ExportNamedDeclaration' ||
            node.type === 'ExportAllDeclaration') &&
          node.source &&
          node.exportKind !== 'type'
        )
          specifiers.push(node.source.value)
      }
      // `require` and `import()` anywhere in the file.
      for (const match of fs
        .readFileSync(file, 'utf8')
        .matchAll(/\b(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/g))
        specifiers.push(match[1])
      for (const specifier of specifiers) {
        const resolved = resolve(file, specifier)
        if (resolved) visit(resolved)
        else packages.add(specifier)
      }
    }
    visit(entry)
    return {
      files: [...files].map((file) => path.relative(src, file)),
      packages: [...packages],
    }
  }

  it('loads no analytics, PostHog or error tracking', () => {
    const { files, packages } = graph(
      path.join(__dirname, 'scrubLaunchAddress.web.ts')
    )
    // It does follow the scrub's own modules.
    expect(files).toContain('lib/purchaseReturn.ts')
    expect(files).toContain('lib/launchAddress.ts')
    for (const file of files)
      expect(file).not.toMatch(/analytics|posthog|errorTracking|sentry/i)
    for (const name of packages)
      expect(name).not.toMatch(/posthog|sentry|analytics/i)
  })
})
