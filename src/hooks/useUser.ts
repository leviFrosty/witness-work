import { useProfile } from '@/stores/profile'
import i18n from '@/lib/locales'
import type { ProfileAvatar } from '@/types/avatar'

export type User = {
  name: string

  hasName: boolean

  displayName: string
  avatar: ProfileAvatar

  customAvatarBackground: string | null
  hasCompletedProfileSetup: boolean
}

const useUser = (): User => {
  const { name, avatar, customAvatarBackground, hasCompletedProfileSetup } =
    useProfile()
  const trimmedName = (name ?? '').trim()
  const hasName = trimmedName.length > 0
  return {
    name: trimmedName,
    hasName,
    displayName: hasName ? trimmedName : i18n.t('profileGreetingNoName'),
    avatar,
    customAvatarBackground,
    hasCompletedProfileSetup,
  }
}

export default useUser
