import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { transformSync } from '@babel/core'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const fromPreset = createRequire(require.resolve('babel-preset-expo'))
const typescript = fromPreset('@babel/plugin-transform-typescript')
const jsx = fromPreset('@babel/plugin-syntax-jsx')
const reactCompiler = require('babel-plugin-react-compiler')

type CompilerEvent = {
  kind: string
  fnLoc?: { start: { line: number } } | null
  detail?: { reason?: string; options?: { reason?: string } }
}

function compile(file: string) {
  const filename = path.resolve(__dirname, '../../../..', file)
  const source = readFileSync(filename, 'utf8')
  const lines = source.split('\n')
  const events: CompilerEvent[] = []
  transformSync(source, {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [
      [typescript, { isTSX: true }],
      jsx,
      [
        reactCompiler,
        {
          target: '19',
          panicThreshold: 'none',
          logger: {
            logEvent: (_: string, event: CompilerEvent) => events.push(event),
          },
        },
      ],
    ],
  })
  const nameAt = (event: CompilerEvent) =>
    /(?:const|function)\s+(\w+)/.exec(
      lines[(event.fnLoc?.start.line ?? 1) - 1]
    )?.[1]
  return {
    compiled: events
      .filter((event) => event.kind === 'CompileSuccess')
      .map(nameAt),
    skipped: events
      .filter((event) => event.kind.endsWith('Error'))
      .map(
        (event) =>
          `${nameAt(event)}: ${event.detail?.reason ?? event.detail?.options?.reason}`
      ),
  }
}

it('compiles the map and its pin hover with the React Compiler', () => {
  const map = compile('src/features/map/screens/MapScreen.tsx')
  expect(map.skipped).toEqual([])
  expect(map.compiled).toEqual(
    expect.arrayContaining(['FullMapView', 'MapScreen'])
  )
  const hover = compile('src/features/map/hooks/usePinHover.ts')
  expect(hover.skipped).toEqual([])
  expect(hover.compiled).toEqual(expect.arrayContaining(['usePinHover']))
})
