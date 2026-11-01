import { mmkvStorage } from '@/stores/mmkv'

const KEY = 'devLaunchUpdateReveal'

let armedThisLaunch: boolean | undefined

export const armLaunchReveal = () => mmkvStorage.set(KEY, true)

export const isLaunchRevealArmed = () => {
  if (armedThisLaunch === undefined) {
    armedThisLaunch = mmkvStorage.getBoolean(KEY) ?? false
    if (armedThisLaunch) mmkvStorage.delete(KEY)
  }
  return armedThisLaunch
}
