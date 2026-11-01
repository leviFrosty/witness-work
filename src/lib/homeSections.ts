import i18n from '@/lib/locales'
import {
  getEffectiveHomeScreenOrder,
  type HomeScreenElementKey,
  PREFERENCE_DEFAULTS,
  usePreferences,
} from '@/stores/preferences'
import usePet from '@/stores/pet'
import { toast } from '@/stores/toasts'

export const homeSectionTitle = (key: HomeScreenElementKey): string => {
  switch (key) {
    case 'approachingConversations':
      return i18n.t('approachingConversations')
    case 'together':
      return i18n.t('buddies_together')
    case 'tabletServiceYearSummary':
      return i18n.t('serviceYearSummary')
    case 'serviceReport':
      return i18n.t('serviceReport')
    case 'mileage':
      return i18n.t('mileage.title')
    case 'pet':
      return i18n.t('pet.homeSectionLabel')
    case 'quickActions':
      return i18n.t('quickActions_sectionTitle')
    case 'thisWeek':
      return i18n.t('thisWeek')
    case 'timer':
      return i18n.t('timer')
    case 'didYouKnow':
      return i18n.t('didYouKnow_kicker')
  }
}

export type HomeSectionCapabilities = {
  isTablet: boolean
  hasAnnualGoal: boolean
  showsTimer: boolean
  mileageTrackingEnabled: boolean | undefined

  buddiesAvailable: boolean
}

export const isHomeSectionAvailable = (
  key: HomeScreenElementKey,
  {
    isTablet,
    hasAnnualGoal,
    showsTimer,
    mileageTrackingEnabled,
    buddiesAvailable,
  }: HomeSectionCapabilities
) => {
  if (key === 'tabletServiceYearSummary') return isTablet && hasAnnualGoal
  if (key === 'timer') return showsTimer
  if (key === 'mileage') return mileageTrackingEnabled === true
  if (key === 'together') return buddiesAvailable
  return true
}

export const moveHomeSection = (
  order: HomeScreenElementKey[],
  key: HomeScreenElementKey,
  target: HomeScreenElementKey
): HomeScreenElementKey[] => {
  const from = order.indexOf(key)
  const to = order.indexOf(target)
  if (from < 0 || to < 0 || from === to) return order
  const next = [...order]
  next.splice(from, 1)
  next.splice(to, 0, key)
  return next
}

export const isHomeSectionOn = (
  key: HomeScreenElementKey,
  homeScreenElements: Partial<Record<HomeScreenElementKey, boolean>>
) => homeScreenElements[key] ?? PREFERENCE_DEFAULTS.homeScreenElements[key]

export const isHomeSectionShown = (
  key: HomeScreenElementKey,
  {
    homeScreenElements,
    petPromptDismissed,
    hasPet,
  }: {
    homeScreenElements: Partial<Record<HomeScreenElementKey, boolean>>
    petPromptDismissed: boolean
    hasPet: boolean
  }
) =>
  isHomeSectionOn(key, homeScreenElements) &&
  !(key === 'pet' && !hasPet && petPromptDismissed)

export const setHomeSectionShown = (
  key: HomeScreenElementKey,
  shown: boolean
) => {
  const { homeScreenElements, set } = usePreferences.getState()
  const offerAgain = key === 'pet' && shown && usePet.getState().pet === null
  set({
    homeScreenElements: { ...homeScreenElements, [key]: shown },
    ...(offerAgain ? { petPromptDismissed: false } : {}),
  })
}

export const moveHomeSectionTo = (
  key: HomeScreenElementKey,
  target: HomeScreenElementKey
) => {
  const { homeScreenElementsOrder, set } = usePreferences.getState()
  set({
    homeScreenElementsOrder: moveHomeSection(
      getEffectiveHomeScreenOrder(homeScreenElementsOrder),
      key,
      target
    ),
  })
}

export const hideHomeSection = (key: HomeScreenElementKey) => {
  setHomeSectionShown(key, false)
  toast.undo({
    title: i18n.t('homeEdit.removed', { section: homeSectionTitle(key) }),
    onUndo: () => setHomeSectionShown(key, true),
  })
}

export const showHomeSection = (key: HomeScreenElementKey) => {
  const { homeScreenElementsOrder, set } = usePreferences.getState()
  const order = getEffectiveHomeScreenOrder(homeScreenElementsOrder)
  set({ homeScreenElementsOrder: [key, ...order.filter((k) => k !== key)] })
  setHomeSectionShown(key, true)
}
