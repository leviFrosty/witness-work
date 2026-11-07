import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const MODULES = path.join(__dirname, '../../modules')

const modules = readdirSync(MODULES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

const manifestOf = (name: string) =>
  JSON.parse(
    readFileSync(path.join(MODULES, name, 'package.json'), 'utf8')
  ) as { main?: string; browser?: unknown }

const hasWebBuild = (name: string) =>
  ['index.web.ts', 'index.web.tsx'].some((file) =>
    existsSync(path.join(MODULES, name, file))
  )

describe('local module entries', () => {
  it('finds every local module, and the ones with a web build', () => {
    expect(modules.length).toBeGreaterThan(20)
    expect(modules.filter(hasWebBuild)).toEqual(
      expect.arrayContaining(['buddies-keychain', 'device-secrets'])
    )
  })

  it.each(modules)('%s has no browser field', (name) => {
    expect(manifestOf(name).browser).toBeUndefined()
  })

  it.each(modules.filter(hasWebBuild))(
    '%s lets each platform resolve its own build',
    (name) => {
      expect(manifestOf(name).main).toBe('index')
    }
  )
})
