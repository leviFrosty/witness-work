import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApprovalFailure } from '@/lib/serverAccount/approvalSession'

const platform = vi.hoisted(() => ({ OS: 'ios' }))
vi.mock('react-native', () => ({ Platform: platform }))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: Record<string, string>) =>
      options ? `${key}(${JSON.stringify(options)})` : key,
  },
}))

import {
  approvalBrowserLine,
  approvalPlace,
  approvalView,
  readScannedApproval,
} from './approvalView'

const ORIGINS = ['https://app.witnesswork.app']
const HELLO = { browser: 'Chrome', system: 'macOS', appVersion: '3.0.0' }
const CONFIRM = {
  step: 'confirm' as const,
  hello: HELLO,
  far: false,
  code: '123456',
  expiresAt: 1,
}
const ready = { phase: 'ready' as const }

/** A real approval link, from bytes that aren't all zeros. */
const LINK = `https://app.witnesswork.app/approve#1${'A'.repeat(21)}Q${'B'.repeat(64)}`

beforeEach(() => {
  platform.OS = 'ios'
})

describe('approvalView', () => {
  it('scans until there is a code, then connects', () => {
    expect(approvalView({ phase: 'scanning' }, null)).toEqual({ kind: 'scan' })
    expect(approvalView({ phase: 'starting' }, null)).toEqual({
      kind: 'loading',
      body: 'approval_connecting',
    })
    expect(approvalView(ready, { step: 'idle' })).toEqual({
      kind: 'loading',
      body: 'approval_connecting',
    })
    expect(approvalView(ready, { step: 'claiming' })).toMatchObject({
      kind: 'loading',
    })
  })

  it('asks YES or NO once claimed, and while the key goes', () => {
    expect(approvalView(ready, CONFIRM)).toEqual({
      kind: 'confirm',
      state: CONFIRM,
      sending: false,
    })
    expect(approvalView(ready, { ...CONFIRM, step: 'sending' })).toMatchObject({
      kind: 'confirm',
      sending: true,
    })
  })

  it('says Approved after the key is sent', () => {
    expect(approvalView(ready, { step: 'done', hello: HELLO })).toEqual({
      kind: 'approved',
      browser: 'approval_browserLine({"browser":"Chrome","system":"macOS"})',
    })
  })

  it('ends a No with Done', () => {
    expect(approvalView(ready, { step: 'declined', hello: HELLO })).toEqual({
      kind: 'ended',
      tone: 'neutral',
      title: 'approval_declinedTitle',
      body: 'approval_declinedBody',
      primary: 'done',
    })
  })

  it.each<[ApprovalFailure, string]>([
    ['expired', 'approval_failExpired'],
    ['used', 'approval_failUsed'],
    ['cancelled', 'approval_failCancelled'],
    ['conflict', 'approval_failConflict'],
    ['offline', 'approval_failOffline'],
    ['badToken', 'approval_failBadToken'],
    ['tampered', 'approval_failTampered'],
    ['server', 'approval_failServer'],
    ['rateLimited', 'handoff_failRateLimited'],
  ])('offers Scan Again after %s', (reason, body) => {
    expect(approvalView(ready, { step: 'failed', reason })).toEqual({
      kind: 'ended',
      tone: 'error',
      offline: reason === 'offline',
      title: 'approval_failedTitle',
      body,
      primary: 'scanAgain',
    })
  })

  it('ends with Done when scanning again can’t help', async () => {
    for (const reason of ['unverified', 'updateRequired'] as const)
      expect(approvalView(ready, { step: 'failed', reason })).toMatchObject({
        primary: 'done',
      })
    expect(
      approvalView(ready, { step: 'failed', reason: 'unverified' })
    ).toMatchObject({ body: 'approval_failUnverified' })
    platform.OS = 'android'
    vi.resetModules()
    const android = await import('./approvalView')
    expect(
      android.approvalView(ready, { step: 'failed', reason: 'unverified' })
    ).toMatchObject({ body: 'approval_failUnverifiedAndroid' })
  })

  it('tries the same code again only when nothing was claimed yet', () => {
    expect(
      approvalView({ phase: 'problem', problem: 'offline' }, null)
    ).toEqual({
      kind: 'ended',
      tone: 'error',
      offline: true,
      body: 'approval_problemOffline',
      primary: 'tryAgain',
    })
    expect(
      approvalView({ phase: 'problem', problem: 'unsupported' }, null)
    ).toMatchObject({ body: 'account_updateRequired', primary: 'done' })
  })

  it('treats a code the phone refused as a bad scan', () => {
    expect(
      approvalView(ready, { step: 'invalid', problem: 'damaged' })
    ).toEqual({ kind: 'scan', problem: 'handoff_scanDamaged' })
  })

  it('shows nothing new while the screen closes', () => {
    expect(approvalView(ready, { step: 'cancelled' })).toEqual({
      kind: 'loading',
      body: null,
    })
  })
})

describe('readScannedApproval', () => {
  it('takes an approval link from a trusted host', () => {
    expect(readScannedApproval(` ${LINK} `, ORIGINS)).toEqual({
      ok: true,
      link: LINK,
    })
  })

  it('names what is wrong with anything else', () => {
    expect(readScannedApproval(LINK.replace('app.', 'evil.'), ORIGINS)).toEqual(
      { ok: false, problem: 'approval_scanWrongHost' }
    )
    expect(readScannedApproval('hello', ORIGINS)).toEqual({
      ok: false,
      problem: 'approval_scanNotApproval',
    })
    expect(readScannedApproval(LINK.replace('#1', '#2'), ORIGINS)).toEqual({
      ok: false,
      problem: 'handoff_scanVersion',
    })
    expect(readScannedApproval(LINK.slice(0, -4), ORIGINS)).toEqual({
      ok: false,
      problem: 'handoff_scanDamaged',
    })
  })

  it('points a Set Up Another Device code to the new phone', () => {
    const handoff = `https://witnesswork.app/accounts/handoff#1${'A'.repeat(86)}`
    expect(readScannedApproval(handoff, ORIGINS)).toEqual({
      ok: false,
      problem: 'approval_scanHandoffCode',
    })
  })
})

describe('copy', () => {
  it('names the browser and system, or says it is a web browser', () => {
    expect(approvalBrowserLine(HELLO)).toBe(
      'approval_browserLine({"browser":"Chrome","system":"macOS"})'
    )
    expect(approvalBrowserLine({ ...HELLO, system: '' })).toBe('Chrome')
    expect(approvalBrowserLine({ ...HELLO, browser: '', system: '' })).toBe(
      'approval_unknownBrowser'
    )
  })

  it('places the browser roughly, or says it is unknown', () => {
    expect(
      approvalPlace({ city: 'Springfield', region: 'Illinois', country: 'US' })
    ).toBe('approval_near({"place":"Springfield, Illinois, US"})')
    expect(approvalPlace({ country: 'US' })).toBe(
      'approval_near({"place":"US"})'
    )
    expect(approvalPlace(undefined)).toBe('approval_placeUnknown')
  })
})
