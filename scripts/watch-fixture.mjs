#!/usr/bin/env node
// Prints a `PhoneContext` (the iPhone/Android phone → watch message, see
// `modules/watch-bridge/ios/WatchProtocol.swift`) with sample data relative to
// now, so the Apple Watch and Wear OS apps can be shown the same state for
// screenshots and parity checks without a paired phone.
//
//   node scripts/watch-fixture.mjs pioneer            # hours, goal, plans, Up Next
//   node scripts/watch-fixture.mjs pioneer --running  # with the timer running
//   node scripts/watch-fixture.mjs publisher          # checkbox report, unreported
//   node scripts/watch-fixture.mjs publisher --reported
//   node scripts/watch-fixture.mjs pioneer --platform android
//
// Seed it where each watch app keeps the phone's context (`phone-context.json`):
// the watch app's App Group container on watchOS, the app's files directory on
// Wear OS (`docs/watch/README.md`). Names and places are made up.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const enUS = JSON.parse(
  readFileSync(join(repo, 'src/locales/en-US.json'), 'utf8')
)
const keys = JSON.parse(
  readFileSync(join(repo, 'src/app/watch/watchStringKeys.json'), 'utf8')
)

const args = process.argv.slice(2)
const scenario = args.find((a) => !a.startsWith('--')) ?? 'pioneer'
const running = args.includes('--running')
const reported = args.includes('--reported')
const platform = args.includes('--platform')
  ? args[args.indexOf('--platform') + 1]
  : 'ios'

const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
const monthName = (d) => d.toLocaleString('en-US', { month: 'long' })
const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

/** `buildWatchSnapshot` sends `…Android` wording where a phone is named. */
const androidKeys = new Set(keys.androidVariants ?? [])
const strings = Object.fromEntries(
  keys.strings.map((key) => [
    key,
    platform === 'android' && androidKeys.has(key)
      ? enUS[`${key}Android`]
      : enUS[key],
  ])
)

function timing(start, timed) {
  const time = start.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
  return {
    start: start.getTime(),
    timed,
    timeText: timed ? time : null,
    clockText: timed ? time.replace(/\s*[AP]M$/, '') : null,
    periodText: timed ? (time.match(/[AP]M$/)?.[0] ?? null) : null,
    weekdayText: start.toLocaleString('en-US', { weekday: 'short' }),
    dateText: start.toLocaleString('en-US', { month: 'short', day: 'numeric' }),
  }
}

const inMinutes = (minutes) => new Date(now.getTime() + minutes * 60_000)
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const tomorrow = startOfDay(new Date(now.getTime() + 24 * 60 * 60_000))

const followUp = {
  id: 'fixture-visit-1',
  kind: 'followUp',
  ...timing(inMinutes(40), true),
  title: 'Ada Reyes',
  detail: 'Psalm 37:29',
  durationText: null,
  place: {
    name: 'Ada Reyes',
    address: '1 Infinite Loop, Cupertino, CA',
    latitude: 37.3318,
    longitude: -122.0312,
  },
}
const plan = {
  id: 'fixture-plan-1',
  kind: 'plan',
  ...timing(inMinutes(180), true),
  title: 'Cart Witnessing',
  detail: 'Central Park',
  durationText: '2h',
  place: {
    name: 'Central Park',
    address: 'Central Park, New York, NY',
    latitude: null,
    longitude: null,
  },
}
const allDayPlan = {
  id: 'fixture-plan-2:' + tomorrow.toISOString().slice(0, 10),
  kind: 'plan',
  ...timing(tomorrow, false),
  title: 'Field Service',
  detail: null,
  durationText: '3h',
  place: null,
}

const day = now.getDate()
const plannedThroughDay = Array.from(
  { length: daysInMonth },
  (_, i) => (i + 1) * 100
)

const hours = scenario === 'pioneer'
const monthMinutes = hours ? 32 * 60 + 30 : 0
const snapshot = {
  version: 1,
  generatedAt: now.getTime(),
  monthKey: monthKey(now),
  monthName: monthName(now),
  showsTimeEntry: hours,
  entryMode: hours ? 'hours' : 'checkbox',
  monthFormatted: hours ? '32.5 Hrs' : '0 Hrs',
  monthCompact: hours ? '32.5h' : '0h',
  monthMinutes,
  goalHours: hours ? 50 : 0,
  progress: hours ? monthMinutes / (50 * 60) : 0,
  plannedThroughDay: hours ? plannedThroughDay : null,
  publisherState: reported ? 'reportedToday' : 'unreported',
  paceText: hours
    ? monthMinutes >= plannedThroughDay[day - 1]
      ? enUS.aheadOfSchedule
      : enUS.behindSchedule
    : null,
  nextMonth: {
    monthKey: monthKey(nextMonth),
    monthName: monthName(nextMonth),
    goalHours: hours ? 50 : 0,
    showsTimeEntry: hours,
  },
  reflectedEntryIds: [],
  upNext: hours ? [followUp, plan, allDayPlan] : [followUp],
  categories: hours
    ? [
        { id: 'fixture-category-ldc', name: 'LDC', isCredit: true },
        { id: 'fixture-category-school', name: 'School', isCredit: false },
      ]
    : [],
  mileage: {
    enabled: true,
    distanceUnit: 'mi',
    vehicles: [{ id: 'fixture-vehicle-1', name: 'Corolla' }],
  },
  strings,
}

const timer = running
  ? {
      isRunning: true,
      startedAt: now.getTime() / 1000 - 25 * 60,
      accumulatedMs: 40 * 60_000,
      revision: 7,
    }
  : {
      isRunning: false,
      startedAt: null,
      accumulatedMs: hours ? 65 * 60_000 : 0,
      revision: 6,
    }

process.stdout.write(
  JSON.stringify({
    protocolVersion: 1,
    sentAt: now.getTime() / 1000,
    snapshot,
    timer,
    resolvedEntryIds: [],
  }) + '\n'
)
