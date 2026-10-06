import { describe, expect, it } from 'vitest'
import packageJson from '../../../../package.json'
import openSourceLicenses from '@/features/settings/constants/openSourceLicenses.json'

describe('openSourceLicenses', () => {
  it('credits every production dependency', () => {
    const credited = new Set(openSourceLicenses.map(({ name }) => name))
    const missing = Object.keys(packageJson.dependencies).filter(
      (name) => !credited.has(name)
    )
    // Run `pnpm licenses:generate` after changing dependencies.
    expect(missing).toEqual([])
  })
})
