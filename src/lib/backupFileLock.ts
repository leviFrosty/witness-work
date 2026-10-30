import { argon2idAsync } from '@noble/hashes/argon2.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { fromB64u, toB64u, utf8 } from '@/lib/bytes'
import {
  BackupOpenError,
  type BackupPlatform,
  BACKUP_PLAINTEXT_VERSION,
  openPlaintext,
  sealPlaintext,
} from '@/lib/serverAccount/backupCrypto'

/**
 * A locked backup file (docs/backup-files.md): Settings → Backup's JSON backup,
 * sealed in the account backup's blob format (`sealPlaintext`) and wrapped in a
 * small JSON envelope that says how to unlock it. `password` files open
 * anywhere with the password, for sharing; `account` files open only on a
 * device holding the same account key, for the User's own devices.
 */

export const LOCKED_BACKUP_FORMAT = 'witnesswork-encrypted-backup'
const ENVELOPE_VERSION = 1

export type BackupFileLock = 'account' | 'password'

/** Argon2id's cost, as RFC 9106 names it: `m` in KiB, `t` passes, `p` lanes. */
export type PasswordKdf = { m: number; t: number; p: number }

/**
 * OWASP's Argon2id minimum (19 MiB, 2 passes). The noble implementation is pure
 * JS, so this is about what a phone can do in a few seconds.
 */
export const PASSWORD_KDF: PasswordKdf = { m: 19456, t: 2, p: 1 }

export const MIN_BACKUP_PASSWORD_LENGTH = 8

/** What the envelope says before its data: how to unlock it. */
type LockHeader = {
  format: typeof LOCKED_BACKUP_FORMAT
  v: typeof ENVELOPE_VERSION
} & (
  | { lock: 'account' }
  | { lock: 'password'; kdf: { alg: 'argon2id'; salt: string } & PasswordKdf }
)

export type LockedBackupFile = LockHeader & {
  /** B64u `0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305(gzip(plaintext))`. */
  data: string
}

/** What the file says about itself, from inside the ciphertext. */
export type BackupFileOrigin = {
  deviceName: string
  platform: BackupPlatform
  /** Epoch ms, on the writing device's clock. */
  createdAt: number
}

/** A locked file, opened: `file` is the backup JSON, still unvalidated. */
export type UnlockedBackupFile = BackupFileOrigin & { file: unknown }

/** Why a locked file didn't open. */
export type BackupUnlockProblem =
  /** Not a locked file this version can read, or a cost it won't pay. */
  | 'format'
  /** Locked by a newer app version. */
  | 'newer'
  /** The wrong password or account key, or the file was changed. */
  | 'key'
  /** Opened, but there's no backup inside. */
  | 'contents'

export class BackupUnlockError extends Error {
  constructor(readonly problem: BackupUnlockProblem) {
    super(`Locked backup unreadable: ${problem}`)
    this.name = 'BackupUnlockError'
  }
}

/** Whether parsed JSON is a locked backup, of any version. */
export const isLockedBackupFile = (data: unknown): boolean =>
  typeof data === 'object' &&
  data !== null &&
  (data as { format?: unknown }).format === LOCKED_BACKUP_FORMAT

/** `HKDF-SHA256(accountKey, "", "ww-account/v1/backup-file", 32)`. */
export function deriveBackupFileKey(accountKey: Uint8Array): Uint8Array {
  if (accountKey.length !== 32) throw new Error('Account key must be 32 bytes')
  return hkdf(
    sha256,
    accountKey,
    new Uint8Array(0),
    utf8('ww-account/v1/backup-file'),
    32
  )
}

const SALT_BYTES = 16
const NONCE_BYTES = 24

/**
 * The most a file may ask a phone to spend unlocking it. A file is anyone's to
 * write, so one asking for gigabytes is refused, not run.
 */
const KDF_LIMITS = { m: 65536, t: 8, p: 4 }

/**
 * The envelope's header, bound into the ciphertext: a file whose lock or cost
 * was changed doesn't open.
 */
const lockAad = (file: LockHeader) =>
  utf8(
    [
      `ww-backup-file/v${ENVELOPE_VERSION}`,
      file.lock,
      ...(file.lock === 'password'
        ? [file.kdf.alg, file.kdf.m, file.kdf.t, file.kdf.p, file.kdf.salt]
        : []),
    ].join('\n')
  )

/** Same bytes for the same password, however the keyboard composed it. */
const passwordBytes = (password: string) => utf8(password.normalize('NFKC'))

const derivePasswordKey = (
  password: string,
  salt: Uint8Array,
  kdf: PasswordKdf,
  onProgress?: (fraction: number) => void
) =>
  argon2idAsync(passwordBytes(password), salt, {
    ...kdf,
    dkLen: 32,
    // Hands the JS thread back a few times a second, so the screen keeps
    // responding. Each yield costs about a frame, so not more often.
    asyncTick: 100,
    maxmem: (KDF_LIMITS.m + 1024) * 1024,
    onProgress,
  })

type LockOptions = {
  origin: BackupFileOrigin
  randomBytes: (length: number) => Uint8Array
}

const seal = (
  key: Uint8Array,
  header: LockHeader,
  file: unknown,
  { origin, randomBytes }: LockOptions
): LockedBackupFile => ({
  ...header,
  data: toB64u(
    sealPlaintext(
      key,
      { v: BACKUP_PLAINTEXT_VERSION, ...origin, payload: file },
      lockAad(header),
      randomBytes(NONCE_BYTES)
    )
  ),
})

/** Locks `file` to the account key: only the User's devices open it. */
export function lockWithAccountKey(
  file: unknown,
  accountKey: Uint8Array,
  options: LockOptions
): LockedBackupFile {
  const header = {
    format: LOCKED_BACKUP_FORMAT,
    v: ENVELOPE_VERSION,
    lock: 'account',
  } as const
  return seal(deriveBackupFileKey(accountKey), header, file, options)
}

/** Locks `file` with a password: it opens anywhere with the password. */
export async function lockWithPassword(
  file: unknown,
  password: string,
  options: LockOptions & {
    kdf?: PasswordKdf
    onProgress?: (fraction: number) => void
  }
): Promise<LockedBackupFile> {
  if (password.length < MIN_BACKUP_PASSWORD_LENGTH)
    throw new Error('Backup password is too short')
  const kdf = options.kdf ?? PASSWORD_KDF
  const salt = options.randomBytes(SALT_BYTES)
  const header = {
    format: LOCKED_BACKUP_FORMAT,
    v: ENVELOPE_VERSION,
    lock: 'password',
    kdf: { alg: 'argon2id', ...kdf, salt: toB64u(salt) },
  } as const
  const key = await derivePasswordKey(password, salt, kdf, options.onProgress)
  return seal(key, header, file, options)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const withinLimit = (value: unknown, min: number, max: number) =>
  Number.isInteger(value) &&
  (value as number) >= min &&
  (value as number) <= max

/**
 * Reads a locked file's envelope. Throws `BackupUnlockError`: `newer` for a
 * later envelope, `format` for anything this version can't or won't open.
 */
export function readLockedBackupFile(data: unknown): LockedBackupFile {
  if (!isRecord(data) || data.format !== LOCKED_BACKUP_FORMAT)
    throw new BackupUnlockError('format')
  if (typeof data.v === 'number' && data.v > ENVELOPE_VERSION)
    throw new BackupUnlockError('newer')
  if (data.v !== ENVELOPE_VERSION || typeof data.data !== 'string')
    throw new BackupUnlockError('format')
  const header = { format: LOCKED_BACKUP_FORMAT, v: ENVELOPE_VERSION } as const
  if (data.lock === 'account')
    return { ...header, lock: 'account', data: data.data }
  const kdf = data.kdf
  if (
    data.lock !== 'password' ||
    !isRecord(kdf) ||
    kdf.alg !== 'argon2id' ||
    !withinLimit(kdf.p, 1, KDF_LIMITS.p) ||
    !withinLimit(kdf.t, 1, KDF_LIMITS.t) ||
    !withinLimit(kdf.m, 8 * (kdf.p as number), KDF_LIMITS.m) ||
    typeof kdf.salt !== 'string'
  )
    throw new BackupUnlockError('format')
  let salt: Uint8Array
  try {
    salt = fromB64u(kdf.salt)
  } catch {
    throw new BackupUnlockError('format')
  }
  if (salt.length < SALT_BYTES || salt.length > 64)
    throw new BackupUnlockError('format')
  return {
    ...header,
    lock: 'password',
    kdf: {
      alg: 'argon2id',
      m: kdf.m as number,
      t: kdf.t as number,
      p: kdf.p as number,
      salt: kdf.salt,
    },
    data: data.data,
  }
}

function open(key: Uint8Array, file: LockedBackupFile): UnlockedBackupFile {
  let blob: Uint8Array
  try {
    blob = fromB64u(file.data)
  } catch {
    throw new BackupUnlockError('format')
  }
  try {
    const { payload, deviceName, platform, createdAt } = openPlaintext(
      key,
      blob,
      lockAad(file)
    )
    return { file: payload, deviceName, platform, createdAt }
  } catch (error) {
    if (!(error instanceof BackupOpenError)) throw error
    throw new BackupUnlockError(
      error.problem === 'decrypt' ? 'key' : error.problem
    )
  }
}

/** Opens an `account` file with this device's account key. */
export function unlockWithAccountKey(
  file: LockedBackupFile,
  accountKey: Uint8Array
): UnlockedBackupFile {
  if (file.lock !== 'account') throw new BackupUnlockError('format')
  return open(deriveBackupFileKey(accountKey), file)
}

/** Opens a `password` file. A wrong password is `BackupUnlockError('key')`. */
export async function unlockWithPassword(
  file: LockedBackupFile,
  password: string,
  onProgress?: (fraction: number) => void
): Promise<UnlockedBackupFile> {
  if (file.lock !== 'password') throw new BackupUnlockError('format')
  const { m, t, p, salt } = file.kdf
  const key = await derivePasswordKey(
    password,
    fromB64u(salt),
    { m, t, p },
    onProgress
  )
  return open(key, file)
}
