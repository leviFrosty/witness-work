import type { KeyChangeStage } from '@/lib/accountKey/keyChangeRecord'
import type { KeyChangeEvent } from './engine'

/**
 * A change stopped at a step retries on every launch; its `resumed` and
 * `failed` events are sent once a day per stage, so one stuck device doesn't
 * flood analytics. Starts and completions always go.
 */
export const KEY_CHANGE_EVENT_INTERVAL_MS = 24 * 60 * 60 * 1000

export function createKeyChangeEventGate(deps: {
  get: (key: string) => number | null
  set: (key: string, at: number) => void
  now: () => number
}) {
  return (event: KeyChangeEvent, stage?: KeyChangeStage): boolean => {
    if (
      event !== 'account_key_change_resumed' &&
      event !== 'account_key_change_failed'
    )
      return true
    const key = `${event}:${stage ?? 'none'}`
    const last = deps.get(key)
    if (last !== null && deps.now() - last < KEY_CHANGE_EVENT_INTERVAL_MS)
      return false
    deps.set(key, deps.now())
    return true
  }
}
