/**
 * Whether this install's device-local MMKV is its own or a copy a device backup
 * carried here (iOS device backup, Android Auto Backup). MMKV can move with a
 * backup; the keystore (`modules/device-secrets`: `ThisDeviceOnly` on iOS,
 * `noBackupFilesDir` on Android) never does. So the install keeps the same
 * random token in both, and a launch whose MMKV holds a token the keystore
 * doesn't is running on another phone's copy: the session ids that copy lists
 * as "this device" are the old phone's.
 *
 * `moved`: the copies disagree, and the keystore's token now stands for both.
 * `same`: they agree, or one was missing on an install that can't have moved (a
 * first launch, or MMKV cleared while the keystore kept its item). `unknown`:
 * the keystore couldn't be read or written; nothing changed, and the next check
 * tries again.
 */
export type InstallCheck = 'same' | 'moved' | 'unknown'

export type InstallTokenDeps = {
  readLocal: () => string | null
  writeLocal: (token: string) => void
  readKeystore: () => Promise<string | null>
  writeKeystore: (token: string) => Promise<void>
  newToken: () => string
}

export async function verifyInstallToken(
  deps: InstallTokenDeps
): Promise<InstallCheck> {
  const local = deps.readLocal()
  let kept: string | null
  try {
    kept = await deps.readKeystore()
  } catch {
    return 'unknown'
  }
  if (kept) {
    if (local !== kept) deps.writeLocal(kept)
    return local && local !== kept ? 'moved' : 'same'
  }
  const token = deps.newToken()
  try {
    await deps.writeKeystore(token)
  } catch {
    return 'unknown'
  }
  deps.writeLocal(token)
  // A token only in MMKV came from a phone whose keystore had it.
  return local ? 'moved' : 'same'
}

/**
 * The launch's one install check. `check` verifies once and answers the same
 * for the rest of the launch (`unknown` is tried again), so every caller sees
 * `moved` after a move. What a move clears is cleared once, by the `onMoved`
 * listeners: each is called exactly once, at the move, or at once when it
 * registers after it. A listener that throws doesn't stop the others.
 */
export function createInstallCheck(
  deps: InstallTokenDeps & { onError?: (error: unknown) => void }
) {
  let pending: Promise<InstallCheck> | null = null
  let moved = false
  const listeners = new Set<() => void>()

  const call = (listener: () => void) => {
    try {
      listener()
    } catch (error) {
      deps.onError?.(error)
    }
  }

  const check = (): Promise<InstallCheck> => {
    pending ??= verifyInstallToken(deps).then((result) => {
      if (result === 'unknown') pending = null
      if (result === 'moved' && !moved) {
        moved = true
        listeners.forEach(call)
      }
      return result
    })
    return pending
  }

  const onMoved = (listener: () => void): (() => void) => {
    if (moved) call(listener)
    else listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return { check, onMoved }
}
