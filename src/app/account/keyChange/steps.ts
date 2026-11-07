import type { KeyChangeRecord } from '@/lib/accountKey/keyChangeRecord'

export type KeyChangeStepContext = {
  oldKey: Uint8Array

  newKey: Uint8Array
  accountId: string

  record: KeyChangeRecord

  save: (reseal: NonNullable<KeyChangeRecord['reseal']>) => Promise<void>
}

export type KeyChangeStep = (context: KeyChangeStepContext) => Promise<void>

export type KeyChangeStepName = 'reseal' | 'buddies-reset'

export class KeyChangeStepMissingError extends Error {
  constructor(readonly step: KeyChangeStepName) {
    super(`Key change step not registered: ${step}`)
    this.name = 'KeyChangeStepMissingError'
  }
}

const missing =
  (name: KeyChangeStepName): KeyChangeStep =>
  async () => {
    throw new KeyChangeStepMissingError(name)
  }

const steps: Record<KeyChangeStepName, KeyChangeStep> = {
  reseal: missing('reseal'),
  'buddies-reset': missing('buddies-reset'),
}

export function registerKeyChangeStep(
  name: KeyChangeStepName,
  step: KeyChangeStep
): void {
  steps[name] = step
}

export const keyChangeStep = (name: KeyChangeStepName): KeyChangeStep =>
  steps[name]
