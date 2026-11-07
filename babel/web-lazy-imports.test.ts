import { createRequire } from 'node:module'
import path from 'node:path'
import { transformSync } from '@babel/core'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const webLazyImports = require('./web-lazy-imports')
const typescript = createRequire(require.resolve('babel-preset-expo'))(
  '@babel/plugin-transform-typescript'
)

const appFile = path.resolve(__dirname, '../src/app/navigation/Stack.tsx')

const transform = (
  code: string,
  { platform = 'web', filename = appFile } = {}
) =>
  transformSync(code, {
    filename,
    babelrc: false,
    configFile: false,
    caller: { name: 'metro', platform } as never,
    plugins: [webLazyImports, [typescript, { isTSX: true }]],
  })!.code!.replaceAll('"', "'")

const screen = `import Stack from './Stack'
export const Screens = () => (
  <Stack.Screen
    name='Contacts'
    getComponent={() => require('@/features/contacts/Contacts').default}
  />
)`

describe('web-lazy-imports', () => {
  it("turns a screen's getComponent into a lazy screen on the web", () => {
    const code = transform(screen)
    expect(code).toContain(
      "import { lazyScreen as __wwLazyScreen } from '@/lib/lazyScreen'"
    )
    expect(code).toMatch(
      /const _LazyScreen = __wwLazyScreen\(\(\) => import\('@\/features\/contacts\/Contacts'\)\.then\(module => module\.default\)\);/
    )
    expect(code).toContain('getComponent={() => _LazyScreen}')
    expect(code).not.toContain('require(')

    expect(code.indexOf("from './Stack'")).toBeLessThan(
      code.indexOf('const _LazyScreen')
    )
  })

  it('reads named exports and object properties too', () => {
    const code = transform(`export const screens = [
      { name: 'A', getComponent: () => require('./A').AScreen as never },
    ]`)
    expect(code).toContain(
      "__wwLazyScreen(() => import('./A').then(module => module.AScreen))"
    )
    expect(code).toContain('getComponent: () => _LazyScreen')
  })

  it("imports a CanvasKit gate's loader instead of requiring it", () => {
    const code =
      transform(`import { canvasKitComponent } from '@/lib/canvasKit/canvasKitComponent'
const Chart = canvasKitComponent((): typeof Chart => require('./Chart').default)
const getPet = canvasKitScreen(() => require('./Pet').default)`)
    expect(code).toContain(
      "canvasKitComponent(() => import('./Chart').then(module => module.default))"
    )
    expect(code).toContain(
      "canvasKitScreen(() => import('./Pet').then(module => module.default))"
    )
    expect(code).not.toContain('lazyScreen')
  })

  it('leaves iOS and Android, and files outside src/, alone', () => {
    for (const code of [
      transform(screen, { platform: 'ios' }),
      transform(screen, { platform: 'android' }),
      transform(screen, {
        filename: path.resolve(__dirname, '../node_modules/x/Stack.tsx'),
      }),
    ]) {
      expect(code).toContain(
        "getComponent={() => require('@/features/contacts/Contacts').default}"
      )
      expect(code).not.toContain('import(')
    }
  })

  it('leaves loaders that do more than read one export', () => {
    const code = transform(
      `const a = <S getComponent={() => pick(require('./A'))} />`
    )
    expect(code).toContain("getComponent={() => pick(require('./A'))}")
  })
})
