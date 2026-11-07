import { describe, expect, it, vi } from 'vitest'
import {
  createInstallCheck,
  verifyInstallToken,
} from '@/lib/serverAccount/installToken'

const setup = (local: string | null, kept: string | null) => {
  const store = { local, kept }
  const deps = {
    readLocal: () => store.local,
    writeLocal: vi.fn((token: string) => {
      store.local = token
    }),
    readKeystore: vi.fn(async () => store.kept),
    writeKeystore: vi.fn(async (token: string) => {
      store.kept = token
    }),
    newToken: () => 'fresh-token',
  }
  return { store, deps }
}

describe('verifyInstallToken', () => {
  it('keeps everything when both copies match', async () => {
    const { store, deps } = setup('t1', 't1')
    await expect(verifyInstallToken(deps)).resolves.toBe('same')
    expect(deps.writeKeystore).not.toHaveBeenCalled()
    expect(store).toEqual({ local: 't1', kept: 't1' })
  })

  it('starts a token on an install that had none', async () => {
    const { store, deps } = setup(null, null)
    await expect(verifyInstallToken(deps)).resolves.toBe('same')
    expect(store).toEqual({ local: 'fresh-token', kept: 'fresh-token' })
  })

  it('copies the keystore’s token back after MMKV was cleared', async () => {
    const { store, deps } = setup(null, 'kept')
    await expect(verifyInstallToken(deps)).resolves.toBe('same')
    expect(store).toEqual({ local: 'kept', kept: 'kept' })
  })

  it('says moved for MMKV restored onto a phone without the keystore item', async () => {
    const { store, deps } = setup('old-phone', null)
    await expect(verifyInstallToken(deps)).resolves.toBe('moved')
    expect(store).toEqual({ local: 'fresh-token', kept: 'fresh-token' })
  })

  it('says moved when the two copies differ', async () => {
    const { store, deps } = setup('old-phone', 'this-phone')
    await expect(verifyInstallToken(deps)).resolves.toBe('moved')
    expect(store).toEqual({ local: 'this-phone', kept: 'this-phone' })
  })

  it('says unknown and changes nothing when the keystore can’t be read', async () => {
    const { store, deps } = setup('old-phone', null)
    deps.readKeystore.mockRejectedValueOnce(new Error('locked'))
    await expect(verifyInstallToken(deps)).resolves.toBe('unknown')
    expect(store).toEqual({ local: 'old-phone', kept: null })
  })

  it('says unknown, keeping MMKV, when the keystore write fails', async () => {
    const { store, deps } = setup('old-phone', null)
    deps.writeKeystore.mockRejectedValueOnce(new Error('full'))
    await expect(verifyInstallToken(deps)).resolves.toBe('unknown')
    expect(store.local).toBe('old-phone')
  })
})

describe('createInstallCheck', () => {
  it('tells listeners about a move once, however often it’s checked', async () => {
    const { deps } = setup('old-phone', 'this-phone')
    const install = createInstallCheck(deps)
    const moved = vi.fn()
    install.onMoved(moved)
    await expect(install.check()).resolves.toBe('moved')

    await expect(install.check()).resolves.toBe('moved')
    await install.check()
    expect(moved).toHaveBeenCalledTimes(1)
    expect(deps.readKeystore).toHaveBeenCalledTimes(1)
  })

  it('tells a listener that registers after the move, once', async () => {
    const { deps } = setup('old-phone', 'this-phone')
    const install = createInstallCheck(deps)
    await install.check()
    const late = vi.fn()
    install.onMoved(late)
    await install.check()
    expect(late).toHaveBeenCalledTimes(1)
  })

  it('tells nobody when the install is its own', async () => {
    const { deps } = setup('t1', 't1')
    const install = createInstallCheck(deps)
    const moved = vi.fn()
    install.onMoved(moved)
    await install.check()
    expect(moved).not.toHaveBeenCalled()
  })

  it('checks again after an unknown answer', async () => {
    const { deps } = setup('old-phone', 'this-phone')
    deps.readKeystore.mockRejectedValueOnce(new Error('locked'))
    const install = createInstallCheck(deps)
    const moved = vi.fn()
    install.onMoved(moved)
    await expect(install.check()).resolves.toBe('unknown')
    await expect(install.check()).resolves.toBe('moved')
    expect(moved).toHaveBeenCalledTimes(1)
  })

  it('keeps telling the others when one listener throws', async () => {
    const { deps } = setup('old-phone', 'this-phone')
    const install = createInstallCheck(deps)
    const after = vi.fn()
    install.onMoved(() => {
      throw new Error('boom')
    })
    install.onMoved(after)
    await install.check()
    expect(after).toHaveBeenCalledTimes(1)
  })
})
