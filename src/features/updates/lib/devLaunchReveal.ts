import { mmkvStorage } from '@/stores/mmkv'

const KEY = 'devLaunchUpdateReveal'

let armedThisLaunch: boolean | undefined

/**
 * Developer Tools' "Reset trigger" on a build below `UPDATE_REVEAL_VERSION` —
 * as a development build is until the release's version bump. The next launch
 * plays the update reveal as if the update had just landed.
 */
export const armLaunchReveal = () => mmkvStorage.set(KEY, true)

/**
 * Whether Developer Tools armed this launch. Read once per JS session and
 * cleared, so it fires a single launch; stable across repeat calls, which a
 * development build's double-invoked state initializers make.
 */
export const isLaunchRevealArmed = () => {
  if (armedThisLaunch === undefined) {
    armedThisLaunch = mmkvStorage.getBoolean(KEY) ?? false
    if (armedThisLaunch) mmkvStorage.delete(KEY)
  }
  return armedThisLaunch
}
