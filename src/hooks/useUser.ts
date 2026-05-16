import { useProfile } from '@/stores/profile'
import i18n from '@/lib/locales'
import type { ProfileAvatar } from '@/types/avatar'

/**
 * Shape of the User's profile-only data, as exposed to React consumers.
 *
 * The glossary separates **User** (the human who installed the app — owns
 * profile, preferences, history) from **Publisher** (the User's field-ministry
 * role). This hook surfaces the User's identity-shaped data (name, avatar,
 * avatar background, setup flag) and is the counterpart to `usePublisher()`,
 * which surfaces role/capability data. Consumers that need both call both
 * hooks.
 */
export type User = {
  /** Trimmed name from the profile store. Empty string if unset. */
  name: string
  /** Whether the User has set a non-empty name. */
  hasName: boolean
  /**
   * Name to render in the UI — falls back to a localized greeting when the User
   * has not set a name yet.
   */
  displayName: string
  avatar: ProfileAvatar
  /**
   * Supporter-only override for the avatar/profile background color. `null`
   * means follow the accent color.
   */
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
