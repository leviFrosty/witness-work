import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { accessTokenKeys, signAccessToken } from '../accounts/tokens'
import {
  ACCOUNT_TOKEN_SECRET,
  ARTIFACTS_DIR,
  BASE_URL,
  DEV_BYPASS_TOKEN,
  LOCAL_LAUNCHER,
  configured,
  http,
  nextIp,
  openSession,
  writeTranscript,
} from '../test/e2e'
import { NOTES_FIXTURES } from '../test/territoryNotesFixtures'

/**
 * Territory notes on the real model: every fixture in
 * `src/test/territoryNotesFixtures.ts` (English, Spanish, Portuguese, and a
 * messy one) through `POST /scribe/v1/territory-notes`, scored for recall and
 * precision against the expected doors and ranges, and checked that no name or
 * reason comes back. Run it after any change to the instructions.
 *
 * Paid (OpenRouter, well under a cent a fixture): runs only with
 * WW_API_E2E_ALLOW_PAID=1 against the local launcher started with an
 * OpenRouter key (`up --secrets-from <file>`). The report (counts and
 * scores, no notes) lands in `.verify/artifacts/scribe-territory-notes-<timestamp>.json`.
 */

const PAID =
  process.env.WW_API_E2E_ALLOW_PAID === '1' &&
  LOCAL_LAUNCHER &&
  configured('OPENROUTER_API_KEY') &&
  DEV_BYPASS_TOKEN != null &&
  ACCOUNT_TOKEN_SECRET != null

const report: Record<string, unknown> = { baseUrl: BASE_URL, startedAt: new Date().toISOString() }

afterAll(() => {
  writeTranscript('scribe-territory-notes')
  if (!PAID) return
  mkdirSync(ARTIFACTS_DIR, { recursive: true })
  const path = join(
    ARTIFACTS_DIR,
    `scribe-territory-notes-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  )
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`)
  console.info(`territory notes report: ${path}`)
})

type Door = { line: number; street: string | null; door: string; outcome: string }
type Range = { line: number; street: string | null; from: number; to: number; side: string; outcome: string }

const doorKey = (door: Door) => `${door.street ?? '-'}|${door.door.toLowerCase()}|${door.outcome}`
const rangeKey = (range: Range) => `${range.street ?? '-'}|${range.from}-${range.to}|${range.side}|${range.outcome}`

describe.skipIf(!PAID)('Territory notes on the real model', { timeout: 300_000 }, () => {
  let token: string

  beforeAll(async () => {
    const session = await openSession()
    const keys = await accessTokenKeys({
      ACCOUNT_TOKEN_SECRET: ACCOUNT_TOKEN_SECRET!,
      APP_ATTEST_ENVIRONMENT: 'development',
    })
    token = (
      await signAccessToken(keys!, {
        accountId: session.accountId,
        sessionId: session.sessionId,
        platform: 'ios',
      })
    ).accessToken
  })

  it.each(NOTES_FIXTURES.map((fixture) => [fixture.name, fixture] as const))(
    'reads the %s notes',
    async (name, fixture) => {
      const startedAt = Date.now()
      const reply = await http('POST', '/scribe/v1/territory-notes', {
        headers: { authorization: `Bearer ${token}`, 'cf-connecting-ip': nextIp() },
        body: { protocol: 1, notes: fixture.notes, streets: fixture.streets, locale: fixture.locale },
      })
      expect(reply.status).toBe(200)
      const body = reply.body as { doors: Door[]; ranges: Range[]; unread: number[] }
      const expected = new Set([...fixture.doors.map(doorKey), ...fixture.ranges.map(rangeKey)])
      const got = new Set([...body.doors.map(doorKey), ...body.ranges.map(rangeKey)])
      const hits = [...got].filter((key) => expected.has(key)).length
      const recall = hits / expected.size
      const precision = got.size ? hits / got.size : 0
      const returned = JSON.stringify([body.doors, body.ranges]).toLowerCase()
      const leaked = fixture.forbidden.filter((word) => returned.includes(word))
      report[name] = {
        recall,
        precision,
        expected: expected.size,
        returned: got.size,
        unread: body.unread.length,
        missing: [...expected].filter((key) => !got.has(key)),
        extra: [...got].filter((key) => !expected.has(key)),
        leaked,
        ms: Date.now() - startedAt,
      }
      expect(leaked).toEqual([])
      expect(recall).toBeGreaterThanOrEqual(0.8)
      expect(precision).toBeGreaterThanOrEqual(0.8)
    }
  )
})
