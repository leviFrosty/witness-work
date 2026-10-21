import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { LOCAL_MODULES } = require('./with-force-load-local-modules') as {
  LOCAL_MODULES: { importName: string; className: string }[]
}

const modulesDir = join(__dirname, '..', 'modules')

/** Each local module's iOS pod name and module classes, from its config. */
const iosModules = readdirSync(modulesDir).flatMap((dir) => {
  const configPath = join(modulesDir, dir, 'expo-module.config.json')
  const iosDir = join(modulesDir, dir, 'ios')
  if (!existsSync(configPath) || !existsSync(iosDir)) return []
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const classes: string[] = (config.apple ?? config.ios)?.modules ?? []
  const podspec = readdirSync(iosDir).find((f) => f.endsWith('.podspec'))
  if (!podspec || classes.length === 0) return []
  const pod = /s\.name\s*=\s*['"]([^'"]+)['"]/.exec(
    readFileSync(join(iosDir, podspec), 'utf8')
  )?.[1]
  return classes.map((className) => ({ importName: pod, className }))
})

it('retains every local module with iOS code in Release builds', () => {
  // Release links dead-strip a local module nothing in the app target
  // references, and its native calls then silently do nothing in production.
  expect(iosModules.length).toBeGreaterThan(0)
  for (const module of iosModules) expect(LOCAL_MODULES).toContainEqual(module)
})
