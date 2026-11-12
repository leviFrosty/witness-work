import { transformSync } from '@babel/core'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '../../..')

const HOT_PATH = [
  'src/features/plans/screens/ScheduleScreen.tsx',
  'src/features/plans/components/ScheduleCalendarStage.tsx',
  'src/features/plans/components/ScheduleMonthView.tsx',
  'src/features/plans/components/ScheduleWeekRow.tsx',
  'src/features/plans/components/ScheduleYearView.tsx',
  'src/features/plans/components/MonthGoalMeter.tsx',
  'src/features/plans/hooks/useScheduleCalendar.ts',
  'src/components/CalendarDay.tsx',
  'src/components/ui/ScrollAwayHeader.tsx',
]

type CompilerEvent = {
  kind: string
  fnName?: string | null
  detail?: { options?: { reason?: string; description?: string } }
}

function compilerEvents(file: string): CompilerEvent[] {
  const filename = path.join(ROOT, file)
  const events: CompilerEvent[] = []
  transformSync(readFileSync(filename, 'utf8'), {
    filename,
    cwd: ROOT,
    babelrc: false,
    configFile: false,
    caller: {
      name: 'metro',
      bundler: 'metro',
      platform: 'ios',
      isDev: false,
      isServer: false,
      supportsStaticESM: false,
      engine: 'hermes',
      supportsReactCompiler: true,
    } as never,
    presets: [
      [
        'babel-preset-expo',
        {
          'react-compiler': {
            logger: {
              logEvent: (_: unknown, e: CompilerEvent) => events.push(e),
            },
          },
        },
      ],
    ],
  })
  return events
}

describe('the React Compiler', () => {
  it.each(HOT_PATH)(
    'compiles every component and hook in %s',
    (file) => {
      const events = compilerEvents(file)
      const skipped = events
        .filter((e) => e.kind !== 'CompileSuccess' && e.kind !== 'CompileSkip')
        .map(
          (e) =>
            `${e.fnName ?? 'anonymous'}: ${e.detail?.options?.reason ?? e.kind} ${e.detail?.options?.description ?? ''}`
        )
      expect(skipped).toEqual([])
      expect(events.some((e) => e.kind === 'CompileSuccess')).toBe(true)
    },
    60_000
  )
})
