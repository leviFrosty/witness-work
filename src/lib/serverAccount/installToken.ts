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

  return local ? 'moved' : 'same'
}

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
