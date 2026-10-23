import i18n from '@/lib/locales'
import {
  getEffectiveHomeScreenOrder,
  type HomeScreenElementKey,
  usePreferences,
} from '@/stores/preferences'
import usePet from '@/stores/pet'
import { toast } from '@/stores/toasts'

/** A Home section's name, as in Preferences → Home Screen. */
export const homeSectionTitle = (key: HomeScreenElementKey): string => {
  switch (key) {
    case 'approachingConversations':
      return i18n.t('approachingConversations')
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
}

/**
 * Whether a section can show for this User and device at all, whatever they
 * chose to show. A section that can't stays in the stored order, so it comes
 * back where it was.
 */
export const isHomeSectionAvailable = (
  key: HomeScreenElementKey,
  {
    isTablet,
    hasAnnualGoal,
    showsTimer,
    mileageTrackingEnabled,
  }: HomeSectionCapabilities
) => {
  if (key === 'tabletServiceYearSummary') return isTablet && hasAnnualGoal
  if (key === 'timer') return showsTimer
  if (key === 'mileage') return mileageTrackingEnabled === true
  return true
}

/**
 * `order` with `key` moved to where `target` is, shifting the sections between
 * them. Sections hidden by capability keep their place among their neighbors.
 */
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

/**
 * Whether the User shows a section. Before there's a companion, Pet is the
 * offer to adopt one, which "Not now" hides too.
 */
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
  (homeScreenElements[key] ?? true) &&
  !(key === 'pet' && !hasPet && petPromptDismissed)

/**
 * Shows or hides a section; showing Pet brings back an offer answered "Not
 * now".
 */
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

/** Moves a section to where `target` is (dragging it over `target`). */
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

/** Hides a section, with an Undo toast that shows it again. */
export const hideHomeSection = (key: HomeScreenElementKey) => {
  setHomeSectionShown(key, false)
  toast.undo({
    title: i18n.t('homeEdit.removed', { section: homeSectionTitle(key) }),
    onUndo: () => setHomeSectionShown(key, true),
  })
}

/** Shows a hidden section again, first, where it's easy to see. */
export const showHomeSection = (key: HomeScreenElementKey) => {
  const { homeScreenElementsOrder, set } = usePreferences.getState()
  const order = getEffectiveHomeScreenOrder(homeScreenElementsOrder)
  set({ homeScreenElementsOrder: [key, ...order.filter((k) => k !== key)] })
  setHomeSectionShown(key, true)
}
