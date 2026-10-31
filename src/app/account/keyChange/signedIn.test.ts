import { describe, expect, it, vi } from 'vitest'
import { createSignedInNote } from './signedIn'

const KEY = new Uint8Array(32).fill(3)

function setup(
  options: { accountId?: string | null; signedOut?: boolean } = {}
) {
  const deps = {
    sessionAccountId: () =>
      options.accountId === undefined ? 'account' : options.accountId,
    signedOutElsewhere: () => options.signedOut ?? false,
    clearSignedOut: vi.fn(),
    resume: vi.fn(async () => undefined),
    storedKey: vi.fn(async () => KEY),
    refreshHistory: vi.fn(async () => undefined),
    warn: vi.fn(),
  }
  return { deps, noteSignedIn: createSignedInNote(deps) }
}

describe('a session opened again', () => {
  it('resumes, so a change another device beat is deleted with its old key', async () => {
    const { deps, noteSignedIn } = setup({ signedOut: true })
    await noteSignedIn()
    expect(deps.resume).toHaveBeenCalledTimes(1)
    expect(deps.clearSignedOut).toHaveBeenCalledTimes(1)
    expect(deps.refreshHistory).toHaveBeenCalledWith(KEY, 'account')
  })

  it('does nothing without a session', async () => {
    const { deps, noteSignedIn } = setup({ accountId: null })
    await noteSignedIn()
    expect(deps.resume).not.toHaveBeenCalled()
    expect(deps.refreshHistory).not.toHaveBeenCalled()
  })

  it('still reads the history when resuming fails, and says so', async () => {
    const { deps, noteSignedIn } = setup()
    deps.resume.mockRejectedValueOnce(new Error('offline'))
    await noteSignedIn()
    await vi.waitFor(() => expect(deps.warn).toHaveBeenCalledTimes(1))
    expect(deps.clearSignedOut).not.toHaveBeenCalled()
    expect(deps.refreshHistory).toHaveBeenCalledTimes(1)
  })
})
