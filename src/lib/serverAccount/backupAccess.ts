import { getRandomBytes } from 'expo-crypto'
import apis from '@/constants/apis'
import { HttpError } from '@/lib/http/request'
import { serverAccount } from '@/lib/serverAccount'
import type { RegisterAccountOptions } from '@/lib/serverAccount/client'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import { deleteBackup } from '@/lib/serverAccount/backupClient'
import { BackupError } from '@/lib/serverAccount/backupScheduler'
import {
  backupSchedule,
  logBackup,
  useBackupState,
} from '@/lib/serverAccount/backupStore'
import { syncNow } from '@/lib/syncClock'

/**
 * The account a backup op runs as: the account key, its registered account, and
 * the signing options. Shared by the app's backup service and Delete Buddies,
 * which deletes the backup before the key is gone.
 */
export type BackupAccess = {
  accountKey: Uint8Array
  accountId: string
  options: RegisterAccountOptions
}

/** Registers the account when needed; `BackupError` when it can't. */
export async function backupAccessFor(
  accountKey: Uint8Array
): Promise<BackupAccess> {
  const session = await serverAccount.ensure(accountKey)
  if (!session) {
    const cached = serverAccount.cached(accountKey)
    const off =
      !cached?.accountId && (cached?.unavailableUntil ?? 0) > Date.now()
    throw new BackupError(off ? 'unavailable' : 'offline')
  }
  return {
    accountKey,
    accountId: session.accountId,
    options: {
      baseUrl: apis.accounts,
      key: deriveAccountSigningKey(accountKey),
      now: syncNow,
      randomBytes: getRandomBytes,
    },
  }
}

/** A backup request's failure, as the scheduler and Settings name it. */
export function backupErrorFrom(error: unknown): BackupError {
  if (error instanceof BackupError) return error
  if (error instanceof HttpError) {
    // `Retry-After`, or the body's `retryAfter` (seconds) without one.
    const retryAfter = (error.body as { retryAfter?: unknown } | null)
      ?.retryAfter
    const retryAfterMs =
      error.retryAfterMs ??
      (typeof retryAfter === 'number' ? retryAfter * 1_000 : null)
    switch (error.serverCode) {
      case 'too_large':
        return new BackupError('too_large')
      case 'limit':
        return new BackupError('limit')
      case 'rate_limited':
        return new BackupError('rate_limited', retryAfterMs)
      case 'disabled':
        return new BackupError('unavailable')
    }
    if (
      error.kind === 'offline' ||
      error.kind === 'timeout' ||
      error.kind === 'cancelled'
    )
      return new BackupError('offline')
    if (error.kind === 'rateLimited')
      return new BackupError('rate_limited', retryAfterMs)
  }
  return new BackupError('server')
}

/**
 * Runs a backup op as the account. An account the server no longer knows is
 * forgotten and registered again once.
 */
export async function withBackupAccess<T>(
  accountKey: Uint8Array,
  op: (access: BackupAccess) => Promise<T>
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const access = await backupAccessFor(accountKey)
    try {
      return await op(access)
    } catch (error) {
      if (
        attempt === 0 &&
        error instanceof HttpError &&
        error.serverCode === 'unknown_account'
      ) {
        serverAccount.forget()
        continue
      }
      throw backupErrorFrom(error)
    }
  }
}

/**
 * Deletes every slot of `accountKey`'s account, before Delete Buddies deletes
 * the key: afterwards nothing could sign the deletion, and the backup would sit
 * unreadable until it expired. Throws `BackupError` when it can't, so the
 * caller keeps the key. No account (accounts off) means no backup. Afterwards
 * this install's backup, if on, uploads under the new key's account.
 */
export async function deleteBackupsBeforeKeyLoss(
  accountKey: Uint8Array
): Promise<void> {
  try {
    await withBackupAccess(accountKey, (access) => deleteBackup(access.options))
  } catch (error) {
    if (error instanceof BackupError && error.code === 'unavailable') return
    throw error
  }
  const { enabled } = useBackupState.getState()
  backupSchedule.set({
    lastHash: null,
    lastPutAt: null,
    lastSize: null,
    pending: enabled,
  })
  useBackupState.setState({ slots: null, slotsAccountId: null })
  logBackup('info', 'deleted every slot before the account key changed')
}
