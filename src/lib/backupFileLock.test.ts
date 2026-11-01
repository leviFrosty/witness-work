import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { fromB64u } from '@/lib/bytes'
import {
  BackupUnlockError,
  type BackupUnlockProblem,
  isLockedBackupFile,
  LOCKED_BACKUP_FORMAT,
  lockWithAccountKey,
  lockWithPassword,
  readLockedBackupFile,
  unlockWithAccountKey,
  unlockWithPassword,
} from '@/lib/backupFileLock'

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const origin = {
  deviceName: 'iPhone 18 Pro',
  platform: 'ios' as const,
  createdAt: 1_760_000_000_000,
}
const options = { origin, randomBytes: random }

const kdf = { m: 64, t: 1, p: 1 }
const backup = {
  version: 1,
  contactStore: { contacts: [{ id: 'c1', name: 'Ann Example' }] },
}
const accountKey = new Uint8Array(32).fill(7)

const roundTrip = (file: unknown) => JSON.parse(JSON.stringify(file))

const problem = async (open: () => unknown): Promise<BackupUnlockProblem> => {
  try {
    await open()
  } catch (error) {
    expect(error).toBeInstanceOf(BackupUnlockError)
    return (error as BackupUnlockError).problem
  }
  throw new Error('opened')
}

describe('locked backup files', () => {
  it('locks to the account key, and opens only with it', async () => {
    const locked = roundTrip(lockWithAccountKey(backup, accountKey, options))
    expect(locked).toMatchObject({
      format: LOCKED_BACKUP_FORMAT,
      v: 1,
      lock: 'account',
    })
    expect(JSON.stringify(locked)).not.toContain('Ann Example')
    expect(isLockedBackupFile(locked)).toBe(true)
    const file = readLockedBackupFile(locked)
    expect(unlockWithAccountKey(file, accountKey)).toEqual({
      ...origin,
      file: backup,
    })
    expect(
      await problem(() =>
        unlockWithAccountKey(file, new Uint8Array(32).fill(8))
      )
    ).toBe('key')
  })

  it('locks with a password, and a wrong one is a key problem', async () => {
    const locked = roundTrip(
      await lockWithPassword(backup, 'correct horse', { ...options, kdf })
    )
    expect(JSON.stringify(locked)).not.toContain('Ann Example')
    const file = readLockedBackupFile(locked)
    expect((await unlockWithPassword(file, 'correct horse')).file).toEqual(
      backup
    )
    expect(await problem(() => unlockWithPassword(file, 'correct house'))).toBe(
      'key'
    )
  })

  it("writes OWASP's Argon2id cost and a fresh salt by default", async () => {
    const [a, b] = await Promise.all([
      lockWithPassword(backup, 'correct horse', options),
      lockWithPassword(backup, 'correct horse', options),
    ])
    if (a.lock !== 'password' || b.lock !== 'password') throw new Error('lock')
    expect(a.kdf).toMatchObject({ alg: 'argon2id', m: 19456, t: 2, p: 1 })
    expect(fromB64u(a.kdf.salt)).toHaveLength(16)
    expect(a.kdf.salt).not.toBe(b.kdf.salt)
    expect(a.data).not.toBe(b.data)
  })

  it('opens however the keyboard composed the password', async () => {
    const composed = 'café au lait'
    const decomposed = 'café au lait'
    const file = readLockedBackupFile(
      roundTrip(await lockWithPassword(backup, composed, { ...options, kdf }))
    )
    expect((await unlockWithPassword(file, decomposed)).file).toEqual(backup)
  })

  it('refuses a password shorter than 8 characters', async () => {
    await expect(lockWithPassword(backup, 'short', options)).rejects.toThrow()
  })

  it("doesn't open once its lock or cost is changed", async () => {
    const locked = roundTrip(
      await lockWithPassword(backup, 'correct horse', {
        ...options,
        kdf: { m: 64, t: 2, p: 1 },
      })
    )

    const cheaper = { ...locked, kdf: { ...locked.kdf, t: 1 } }
    expect(
      await problem(() =>
        unlockWithPassword(readLockedBackupFile(cheaper), 'correct horse')
      )
    ).toBe('key')
    const account = roundTrip(lockWithAccountKey(backup, accountKey, options))
    expect(
      await problem(() =>
        unlockWithPassword(
          readLockedBackupFile({
            ...account,
            lock: 'password',
            kdf: locked.kdf,
          }),
          'correct horse'
        )
      )
    ).toBe('key')
  })

  it("refuses envelopes it can't read or won't pay for", async () => {
    const locked = roundTrip(
      await lockWithPassword(backup, 'correct horse', { ...options, kdf })
    )
    const read = (data: unknown) => problem(() => readLockedBackupFile(data))
    expect(await read({ ...locked, v: 2 })).toBe('newer')
    expect(await read({ ...locked, lock: 'magic' })).toBe('format')
    expect(
      await read({ ...locked, kdf: { ...locked.kdf, alg: 'scrypt' } })
    ).toBe('format')
    expect(
      await read({ ...locked, kdf: { ...locked.kdf, m: 4 * 1024 * 1024 } })
    ).toBe('format')
    expect(
      await read({ ...locked, kdf: { ...locked.kdf, salt: 'AAAA' } })
    ).toBe('format')
    expect(await read({ ...locked, data: 42 })).toBe('format')
    expect(
      await problem(() =>
        unlockWithPassword(
          readLockedBackupFile({ ...locked, data: 'not+base64' }),
          'correct horse'
        )
      )
    ).toBe('format')
  })

  it("doesn't take a plain backup for a locked one", () => {
    expect(isLockedBackupFile(backup)).toBe(false)
    expect(isLockedBackupFile(null)).toBe(false)
    expect(isLockedBackupFile([LOCKED_BACKUP_FORMAT])).toBe(false)
  })
})
