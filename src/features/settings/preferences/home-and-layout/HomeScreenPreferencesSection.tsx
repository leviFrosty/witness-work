import { analytics } from '@/lib/analytics'
import { useFeatureFlag } from '@/lib/featureFlags'
import i18n from '@/lib/locales'
import {
  GroupedListReorderSection,
  GroupedListSection,
  GroupedListSwitchRow,
} from '@/components/ui/GroupedList'
import {
  getEffectiveHomeScreenOrder,
  usePreferences,
} from '@/stores/preferences'
import usePublisher from '@/hooks/usePublisher'
import usePet from '@/stores/pet'
import useDevice from '@/hooks/useDevice'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import {
  homeSectionTitle,
  isHomeSectionAvailable,
  isHomeSectionShown,
  setHomeSectionShown,
} from '@/lib/homeSections'
import { moveVisible } from '@/lib/reorder'

const HomeElements = () => {
  const {
    homeScreenElements,
    homeScreenElementsOrder,
    mileageTrackingEnabled,
    petPromptDismissed,
    routineEnabled,
    set,
  } = usePreferences()
  const { showsTimer, hasAnnualGoal } = usePublisher()
  const buddiesAvailable = useBuddiesEnabled()
  const territoriesAvailable = useFeatureFlag('territories')
  const hasPet = usePet((s) => s.pet !== null)
  const { isTablet } = useDevice()

  const order = getEffectiveHomeScreenOrder(homeScreenElementsOrder)
  const visibleKeys = order.filter((key) =>
    isHomeSectionAvailable(key, {
      isTablet,
      hasAnnualGoal,
      showsTimer,
      mileageTrackingEnabled,
      buddiesAvailable,
      territoriesAvailable,
    })
  )

  return (
    <GroupedListReorderSection
      title={i18n.t('sectionsVisibility')}
      footer={i18n.t('sectionsVisibility_description')}
      data={visibleKeys}
      keyExtractor={(key) => key}
      onMove={(from, to) => {
        const next = moveVisible(order, visibleKeys, from, to)
        if (next !== order) set({ homeScreenElementsOrder: [...next] })
      }}
    >
      {(key) => (
        <GroupedListSwitchRow
          label={homeSectionTitle(key)}
          info={
            key === 'approachingConversations'
              ? i18n.t('approachingConversations_description')
              : undefined
          }
          value={isHomeSectionShown(key, {
            homeScreenElements,
            petPromptDismissed,
            hasPet,
            routineEnabled,
          })}
          onValueChange={(value) => setHomeSectionShown(key, value)}
        />
      )}
    </GroupedListReorderSection>
  )
}

const HomeExtras = () => {
  const { hideDonateHeart, hideSupporterNudge, set } = usePreferences()

  return (
    <GroupedListSection>
      <GroupedListSwitchRow
        label={i18n.t('hideDonateHeart')}
        value={hideDonateHeart}
        onValueChange={(value) => set({ hideDonateHeart: value })}
      />
      <GroupedListSwitchRow
        label={i18n.t('hideSupporterNudge')}
        value={hideSupporterNudge}
        onValueChange={(value) => {
          analytics.capture('supporter_nudge_visibility_changed', {
            hidden: value,
            source: 'settings',
          })
          set({ hideSupporterNudge: value })
        }}
      />
    </GroupedListSection>
  )
}

const HomeScreenPreferencesSection = () => (
  <>
    <HomeElements />
    <HomeExtras />
  </>
)

export default HomeScreenPreferencesSection
