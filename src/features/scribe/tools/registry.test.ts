import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: {
    OS: 'ios',
    select: (options: { ios?: unknown }) => options.ios,
  },
  AppState: { currentState: 'active', addEventListener: vi.fn() },
}))
vi.mock('expo-crypto', () => ({
  randomUUID: () => 'test-uuid',
  getRandomBytes: (count: number) => new Uint8Array(count),
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: vi.fn(),
}))
vi.mock('@/lib/contactAvatarFiles', () => ({
  deleteAvatarFiles: vi.fn(async () => {}),
}))

const { SCRIBE_TOOLS, scribeTool } = await import('@/features/scribe/tools')
const { DEFAULT_SCRIBE_LIMITS } = await import('@/features/scribe/lib/wire')
const { TOOL_NAME_PATTERN, schemaViolations, toolDefinitions } = await import(
  '@/features/scribe/runtime/wireTools'
)
type JsonValue = import('@/features/scribe/lib/wire').JsonValue
type ScribeTool = import('@/features/scribe/tools/types').ScribeTool

/** Files in tools/ that aren't tools. */
const NOT_TOOLS = new Set(['types.ts', 'index.ts', 'shared.ts'])

const toolsDir = fileURLToPath(new URL('.', import.meta.url))
const toolFiles = readdirSync(toolsDir, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !NOT_TOOLS.has(entry.name)
  )
  .map((entry) => entry.name)

const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length

/** Sentences in a description: text ending in . ! or ? */
const sentences = (text: string) =>
  text.split(/[.!?](?=\s|$)/).filter((part) => part.trim().length > 0).length

const isObject = (
  value: JsonValue | undefined
): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Every optional value is a union with null, written as a type array of one
 * type and null, or an anyOf with a `{ type: 'null' }` branch; never a bare
 * `null` type or a missing key.
 */
function nullableProblems(node: JsonValue, path = '$'): string[] {
  if (!isObject(node)) return []
  const problems: string[] = []
  if (Array.isArray(node.type)) {
    const types = node.type
    if (types.length !== 2 || !types.includes('null'))
      problems.push(`${path}: type array must be [T, "null"]`)
  }
  if (Array.isArray(node.anyOf)) {
    const nullBranches = node.anyOf.filter(
      (option) => isObject(option) && option.type === 'null'
    )
    if (nullBranches.length !== 1)
      problems.push(`${path}: anyOf must have one null branch`)
  }
  if (isObject(node.properties))
    for (const [name, property] of Object.entries(node.properties))
      problems.push(...nullableProblems(property, `${path}.${name}`))
  if (isObject(node.items))
    problems.push(...nullableProblems(node.items, `${path}[]`))
  if (Array.isArray(node.anyOf))
    node.anyOf.forEach((option, index) =>
      problems.push(...nullableProblems(option, `${path}|${index}`))
    )
  return problems
}

describe('tool registry', () => {
  it('registers every tool file exactly once', async () => {
    expect(toolFiles.length).toBeGreaterThan(0)
    const registered = new Set<ScribeTool>(SCRIBE_TOOLS)
    for (const file of toolFiles) {
      const module = (await import(
        /* @vite-ignore */ `${toolsDir}${file}`
      )) as {
        default?: ScribeTool
      }
      expect(module.default, `${file} has no default export`).toBeDefined()
      const matches = SCRIBE_TOOLS.filter((tool) => tool === module.default)
      expect(
        matches,
        `${file} must be in SCRIBE_TOOLS exactly once`
      ).toHaveLength(1)
      registered.delete(module.default!)
    }
    // Nothing in the registry comes from outside tools/.
    expect([...registered].map((tool) => tool.name)).toEqual([])
  })

  it('has unique names in the protocol form', () => {
    const names = SCRIBE_TOOLS.map((tool) => tool.name)
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) expect(name).toMatch(TOOL_NAME_PATTERN)
    for (const tool of SCRIBE_TOOLS) expect(scribeTool(tool.name)).toBe(tool)
    expect(scribeTool('made_up')).toBeNull()
  })

  it('lists reads, then writes, then memory', () => {
    const order = { read: 0, write: 1, destructive: 1, memory: 2 }
    const ranks = SCRIBE_TOOLS.map((tool) => order[tool.access])
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })

  it('marks only deletes destructive', () => {
    expect(
      SCRIBE_TOOLS.filter((tool) => tool.access === 'destructive').map(
        (tool) => tool.name
      )
    ).toEqual(['time_delete'])
  })

  it.each(SCRIBE_TOOLS.map((tool) => [tool.name, tool] as const))(
    '%s has a short, model-facing description',
    (_name, tool) => {
      expect(tool.description.length).toBeLessThanOrEqual(400)
      expect(tool.description.length).toBeLessThanOrEqual(
        DEFAULT_SCRIBE_LIMITS.maxToolDescriptionChars
      )
      const count = sentences(tool.description)
      expect(count).toBeGreaterThanOrEqual(2)
      expect(count).toBeLessThanOrEqual(4)
    }
  )

  it('marks only visits_read_notes as returning untrusted text, and turns it off in data protection mode', () => {
    expect(
      SCRIBE_TOOLS.filter((tool) => tool.returnsUntrustedText).map(
        (tool) => tool.name
      )
    ).toEqual(['visits_read_notes'])
    expect(
      SCRIBE_TOOLS.filter((tool) => tool.offInDataProtection).map(
        (tool) => tool.name
      )
    ).toEqual(['visits_read_notes'])
  })
})

describe('wire definitions', () => {
  const definitions = toolDefinitions(SCRIBE_TOOLS)

  it.each(
    definitions.map((definition) => [definition.name, definition] as const)
  )('%s passes the protocol schema rules', (_name, definition) => {
    expect(schemaViolations(definition.inputSchema)).toEqual([])
    expect(nullableProblems(definition.inputSchema)).toEqual([])
    expect(definition.inputSchema.type).toBe('object')
    expect(definition.inputSchema.additionalProperties).toBe(false)
    expect(definition.inputSchema).not.toHaveProperty('$schema')
    expect(bytes(definition.inputSchema)).toBeLessThanOrEqual(
      DEFAULT_SCRIBE_LIMITS.maxToolSchemaBytes
    )
  })

  it('fits the payload limits and the token budget', () => {
    expect(definitions).toHaveLength(SCRIBE_TOOLS.length)
    expect(definitions.length).toBeLessThanOrEqual(
      DEFAULT_SCRIBE_LIMITS.maxTools
    )
    expect(bytes(definitions)).toBeLessThanOrEqual(
      DEFAULT_SCRIBE_LIMITS.maxToolsBytes
    )
    // ≈ 3,500 tokens at the protocol's bytes / 3... spent on every step.
    // newCategory and onDate added ≈ 800 bytes to save a step on their turns,
    // time_update and time_delete ≈ 1,250, and memory_update ≈ 900, so the
    // User doesn't have to repeat a correction.
    expect(bytes(definitions)).toBeLessThanOrEqual(15_500)
  })

  it('declares access and untrusted text as the protocol names them', () => {
    for (const definition of definitions) {
      const tool = scribeTool(definition.name)!
      // Memory edits apply on the device, but still change state.
      expect(definition.access).toBe(
        tool.access === 'memory' ? 'write' : tool.access
      )
      expect(definition.description).toBe(tool.description)
      if (definition.name === 'visits_read_notes')
        expect(definition.returnsUntrustedText).toBe(true)
      else expect(definition).not.toHaveProperty('returnsUntrustedText')
    }
  })

  it('is identical across calls and modes, so every step shares the prompt cache', () => {
    expect(JSON.stringify(toolDefinitions(SCRIBE_TOOLS))).toBe(
      JSON.stringify(definitions)
    )
    // Data protection mode refuses visits_read_notes on the device instead.
    expect(definitions.map((definition) => definition.name)).toContain(
      'visits_read_notes'
    )
    expect(scribeTool('visits_read_notes')!.description).toMatch(
      /dataProtection true/
    )
  })

  it('matches the snapshot of the generated payload', () => {
    expect(definitions).toMatchSnapshot()
  })
})
