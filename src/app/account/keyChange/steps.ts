import type { KeyChangeRecord } from '@/lib/accountKey/keyChangeRecord'

/**
 * The key change's later steps (docs/account-key-change.md, "The device flow"):
 * 5, re-sealing Cloud Sync slots, photos and backup slots under the new key,
 * and 6, resetting Buddies with reconnect invites. Each is a function the
 * engine runs once the stage before it is recorded, and again after a crash
 * until it resolves, so each must be idempotent and resume from `record`.
 */
export type KeyChangeStepContext = {
  /** K1: the key the account had. Still opens the old inbox and slots. */
  oldKey: Uint8Array
  /** K2: the account's key now, and this device's. */
  newKey: Uint8Array
  accountId: string
  /** As last saved; `reseal` lists what the re-seal step finished. */
  record: KeyChangeRecord
  /**
   * Saves progress into the record (the re-seal step's done ids), so a crash
   * resumes past it. Only `reseal` may change.
   */
  save: (reseal: NonNullable<KeyChangeRecord['reseal']>) => Promise<void>
}

/**
 * Resolves when the step is done; throws to stop the change at the stage before
 * it, to be run again later (next launch or Try Again).
 *
 * The re-seal step puts another device's sync slot with `x-ww-reseal: 1`, and
 * leaves a photo the server refuses for space, count or rate under the old key,
 * where the key history opens it, without failing.
 */
export type KeyChangeStep = (context: KeyChangeStepContext) => Promise<void>

export type KeyChangeStepName = 'reseal' | 'buddies-reset'

/** No feature registered the step: the change stops before it. */
export class KeyChangeStepMissingError extends Error {
  constructor(readonly step: KeyChangeStepName) {
    super(`Key change step not registered: ${step}`)
    this.name = 'KeyChangeStepMissingError'
  }
}

/**
 * Until its feature registers it, a step stops the change there, retried on
 * later launches, so the old key is never deleted without it.
 */
const missing =
  (name: KeyChangeStepName): KeyChangeStep =>
  async () => {
    throw new KeyChangeStepMissingError(name)
  }

const steps: Record<KeyChangeStepName, KeyChangeStep> = {
  reseal: missing('reseal'),
  'buddies-reset': missing('buddies-reset'),
}

/** Called once at startup by the feature that implements the step. */
export function registerKeyChangeStep(
  name: KeyChangeStepName,
  step: KeyChangeStep
): void {
  steps[name] = step
}

export const keyChangeStep = (name: KeyChangeStepName): KeyChangeStep =>
  steps[name]
