import { globSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { transformSync } from '@babel/core'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const lucideImports = require('./lucide-imports')
const { readLucideExports } = lucideImports
const typescript = createRequire(require.resolve('babel-preset-expo'))(
  '@babel/plugin-transform-typescript'
)

const root = path.resolve(__dirname, '..')
const icons = 'lucide-react-native/dist/esm/icons'

const transform = (code: string, filename = 'file.tsx', caller = 'metro') =>
  transformSync(code, {
    filename,
    babelrc: false,
    configFile: false,
    caller: { name: caller },
    plugins: [
      lucideImports,
      [typescript, { isTSX: filename.endsWith('.tsx') }],
    ],
  })!.code!

describe('readLucideExports', () => {
  const exportsByName: Map<string, { source: string; imported: string }> =
    readLucideExports()

  it('maps icon names and their aliases to per-icon files', () => {
    expect(exportsByName.get('Plus')).toEqual({
      source: `${icons}/plus.mjs`,
      imported: 'default',
    })
    expect(exportsByName.get('PlusIcon')).toEqual(exportsByName.get('Plus'))
    expect(exportsByName.get('AlarmCheck')).toEqual({
      source: `${icons}/alarm-clock-check.mjs`,
      imported: 'default',
    })
    expect(exportsByName.size).toBeGreaterThan(1000)
  })

  it('maps the non-icon value exports to their own modules', () => {
    expect(exportsByName.get('LucideProvider')).toEqual({
      source: 'lucide-react-native/dist/esm/context.mjs',
      imported: 'LucideProvider',
    })
    expect(exportsByName.get('Icon')).toEqual({
      source: 'lucide-react-native/dist/esm/Icon.mjs',
      imported: 'default',
    })
  })

  it('points at files that exist', () => {
    const dir = lucideImports.lucidePackageDir(root)
    for (const { source } of new Set(exportsByName.values())) {
      expect(() =>
        readFileSync(
          path.join(dir, source.slice('lucide-react-native/'.length))
        )
      ).not.toThrow()
    }
  })
})

describe('lucide-imports babel plugin', () => {
  it('rewrites named and aliased icon imports to per-icon files', () => {
    const code = transform(
      "import { Plus, X as Close } from 'lucide-react-native'\nconsole.log(Plus, Close)"
    )
    expect(code).toContain(`import Plus from "${icons}/plus.mjs";`)
    expect(code).toContain(`import Close from "${icons}/x.mjs";`)
    expect(code).not.toMatch(/from ['"]lucide-react-native['"]/)
  })

  it('imports named exports by their name', () => {
    const code = transform(
      "import { LucideProvider as P } from 'lucide-react-native'\nconsole.log(P)"
    )
    expect(code).toContain(
      'import { LucideProvider as P } from "lucide-react-native/dist/esm/context.mjs";'
    )
  })

  it('drops type-only imports instead of rewriting them', () => {
    const code = transform(
      [
        "import type { LucideIcon } from 'lucide-react-native'",
        "import { type LucideProps, Plus } from 'lucide-react-native'",
        "import { LucideIcon as Icon } from 'lucide-react-native'",
        'const icon: Icon = Plus',
        'export const props: LucideProps = { icon }',
      ].join('\n')
    )
    expect(code).toContain(`import Plus from "${icons}/plus.mjs";`)
    expect(code).not.toMatch(/from ['"]lucide-react-native['"]/)
  })

  it('keeps names it does not know on the original import', () => {
    const code = transform(
      "import { Plus, NotAnIcon } from 'lucide-react-native'\nconsole.log(Plus, NotAnIcon)"
    )
    expect(code).toContain("import { NotAnIcon } from 'lucide-react-native'")
    expect(code).toContain(`import Plus from "${icons}/plus.mjs";`)
  })

  it('leaves namespace imports and other packages alone', () => {
    const code = transform(
      "import * as all from 'lucide-react-native'\nimport { Plus } from 'other'\nconsole.log(all, Plus)"
    )
    expect(code).toContain("import * as all from 'lucide-react-native';")
    expect(code).toContain("import { Plus } from 'other';")
  })

  it('leaves imports alone outside Metro, which alone resolves the rewrites', () => {
    const code = transform(
      "import { Plus } from 'lucide-react-native'\nconsole.log(Plus)",
      'file.tsx',
      'babel-jest'
    )
    expect(code).toContain("import { Plus } from 'lucide-react-native';")
  })

  // A barrel import that survives the transform bundles every icon again.
  it('leaves no app file importing the full icon set', () => {
    const files = globSync('{src,modules,targets}/**/*.{ts,tsx}', {
      cwd: root,
    }).filter((file) => !/node_modules|\.test\.|__tests__/.test(file))
    expect(files.length).toBeGreaterThan(100)
    const offenders = files.filter((file) => {
      const source = readFileSync(path.join(root, file), 'utf8')
      if (!source.includes('lucide-react-native')) return false
      return /from ['"]lucide-react-native['"]|require\(['"]lucide-react-native['"]\)/.test(
        transform(source, file)
      )
    })
    expect(offenders).toEqual([])
  })
})
