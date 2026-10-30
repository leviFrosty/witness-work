import { describe, expect, it, vi } from 'vitest'
import {
  KeyChangeStepMissingError,
  keyChangeStep,
  registerKeyChangeStep,
} from './steps'

const context = {} as Parameters<ReturnType<typeof keyChangeStep>>[0]

describe('key change steps', () => {
  it('stops the change at a step nothing registered, so the old key is kept', async () => {
    await expect(
      keyChangeStep('buddies-reset')(context)
    ).rejects.toBeInstanceOf(KeyChangeStepMissingError)
  })

  it('runs the step its feature registered', async () => {
    const reseal = vi.fn(async () => undefined)
    registerKeyChangeStep('reseal', reseal)
    await keyChangeStep('reseal')(context)
    expect(reseal).toHaveBeenCalledWith(context)
  })
})
