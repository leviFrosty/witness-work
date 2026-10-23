import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'ios', select: (options: { ios?: unknown }) => options.ios },
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
  default: { expoConfig: { version: '3.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/contactAvatarFiles', () => ({
  deleteAvatarFiles: vi.fn(async () => {}),
}))
// The hook's runtime reaches the session client and attestation; the pure
// function under test needs neither.
vi.mock('@/features/scribe/runtime/status', () => ({
  refreshDeviceGate: vi.fn(async () => {}),
}))
vi.mock('@/hooks/useScribeEnabled', () => ({
  useScribeEnabled: () => true,
}))

import {
  scribeAvailability,
  type ScribeAvailabilityInput,
} from '@/features/scribe/hooks/useScribeAvailability'
import {
  DEFAULT_SCRIBE_LIMITS,
  type ScribeStatusWire,
  type UsageSnapshotWire,
} from '@/features/scribe/lib/wire'
import { INITIAL_GATE } from '@/features/scribe/stores/status'
import type { ScribeAvailability } from '@/features/scribe/types'

const STATUS: ScribeStatusWire = {
  enabled: true,
  reason: null,
  protocol: { min: 1, max: 1 },
  minAppVersion: null,
  disabledTools: [],
  limits: DEFAULT_SCRIBE_LIMITS,
}

const RESETS_AT = 1_793_836_800_000
const LIMITED: UsageSnapshotWire = {
  plan: 'free',
  supporterCheckFailed: false,
  windows: [{ id: 'monthly', percentUsed: 100, resetsAt: RESETS_AT }],
  limited: true,
  resetsAt: RESETS_AT,
  asOf: 1,
}

const input = (
  change: Partial<ScribeAvailabilityInput> = {}
): ScribeAvailabilityInput => ({
  enabled: true,
  status: STATUS,
  online: true,
  updateRequiredByServer: false,
  appVersion: '3.0.0',
  gate: INITIAL_GATE,
  devClient: false,
  usage: null,
  ...change,
})

/** Every gate at once: what's left decides. */
const EVERYTHING_WRONG = input({
  status: { ...STATUS, minAppVersion: '9.0.0' },
  online: false,
  updateRequiredByServer: true,
  gate: {
    ineligible: true,
    attestationUnavailable: true,
    suspended: true,
    updateRequired: true,
  },
  usage: LIMITED,
})

const AVAILABLE: ScribeAvailability = {
  status: 'available',
  limited: false,
  resetsAt: null,
}

describe('scribeAvailability precedence', () => {
  const table: [string, ScribeAvailabilityInput, ScribeAvailability][] = [
    [
      'flag off beats everything',
      { ...EVERYTHING_WRONG, enabled: false },
      { status: 'hidden', reason: 'flag_off' },
    ],
    [
      'the server switch beats the connection',
      {
        ...EVERYTHING_WRONG,
        status: { ...STATUS, enabled: false, reason: 'disabled' },
      },
      { status: 'hidden', reason: 'disabled' },
    ],
    [
      'no provider hides it',
      input({ status: { ...STATUS, enabled: false, reason: 'no_provider' } }),
      { status: 'hidden', reason: 'no_provider' },
    ],
    [
      'off without a reason reads as disabled',
      input({ status: { ...STATUS, enabled: false, reason: null } }),
      { status: 'hidden', reason: 'disabled' },
    ],
    ['offline beats the app version', EVERYTHING_WRONG, { status: 'offline' }],
    [
      'a 426 this launch',
      { ...EVERYTHING_WRONG, online: true },
      { status: 'blocked', reason: 'update_required' },
    ],
    [
      'a 426 a Scribe AI call saw',
      input({ gate: { ...INITIAL_GATE, updateRequired: true } }),
      { status: 'blocked', reason: 'update_required' },
    ],
    [
      'below the status minAppVersion',
      input({ status: { ...STATUS, minAppVersion: '3.1.0' } }),
      { status: 'blocked', reason: 'update_required' },
    ],
    [
      'a protocol floor above this build',
      input({ status: { ...STATUS, protocol: { min: 2, max: 2 } } }),
      { status: 'blocked', reason: 'update_required' },
    ],
    [
      'a device that can never attest beats a temporary failure',
      input({
        gate: {
          ...INITIAL_GATE,
          ineligible: true,
          attestationUnavailable: true,
          suspended: true,
        },
      }),
      { status: 'blocked', reason: 'device_ineligible' },
    ],
    [
      'a temporary attestation failure beats a suspension',
      input({
        gate: {
          ...INITIAL_GATE,
          attestationUnavailable: true,
          suspended: true,
        },
      }),
      { status: 'blocked', reason: 'attestation_unavailable' },
    ],
    [
      'a suspended account',
      input({ gate: { ...INITIAL_GATE, suspended: true } }),
      { status: 'blocked', reason: 'suspended' },
    ],
    [
      'the dev fake skips the device gates',
      input({
        devClient: true,
        gate: {
          ...INITIAL_GATE,
          ineligible: true,
          attestationUnavailable: true,
          suspended: true,
        },
      }),
      AVAILABLE,
    ],
    [
      'the dev fake still needs an up-to-date app',
      input({ devClient: true, updateRequiredByServer: true }),
      { status: 'blocked', reason: 'update_required' },
    ],
    [
      'a full window limits it until it resets',
      input({ usage: LIMITED }),
      { status: 'available', limited: true, resetsAt: RESETS_AT },
    ],
    [
      'no reset time unless limited',
      input({ usage: { ...LIMITED, limited: false } }),
      AVAILABLE,
    ],
    ['status never read is fail-open', input({ status: null }), AVAILABLE],
    [
      'a minAppVersion it can’t compare is ignored',
      input({
        appVersion: null,
        status: { ...STATUS, minAppVersion: '9.0.0' },
      }),
      AVAILABLE,
    ],
    ['an unknown connection is tried', input({ online: null }), AVAILABLE],
    ['everything fine', input(), AVAILABLE],
  ]

  it.each(table)('%s', (_, given, expected) => {
    expect(scribeAvailability(given)).toEqual(expected)
  })
})
