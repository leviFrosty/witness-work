import type { ContextMenuEntries } from '@/components/ui/ContextMenu'
import { analytics } from '@/lib/analytics'
import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import type { PetVisit, PetVisitActivity } from '@/types/pet'
import type { RootStackNavigation } from '@/types/rootStack'
import { speciesName } from '@/features/pet/lib/names'

/** Where a visiting pet was opened from, for analytics. */
export type PetVisitSurface = 'home' | 'details'

/** Opens what the User does with the visiting pet's buddy today. */
export function openPetVisitActivity(
  navigation: RootStackNavigation,
  activity: PetVisitActivity
): void {
  if (activity.type === 'plan')
    navigation.navigate('Plan Details', { dayPlanId: activity.planId })
  else if (activity.type === 'followUp')
    navigation.navigate('Visit Details', { visitId: activity.visitId })
  else
    navigation.navigate('Follow-Up Invitation', {
      from: activity.from,
      shareId: activity.shareId,
    })
}

/** "View Plan", or "View Follow-up" for a return visit. */
export const petVisitActivityTitle = (activity: PetVisitActivity): string =>
  i18n.t(
    activity.type === 'plan'
      ? 'pet.visitor.viewPlan'
      : 'pet.visitor.viewFollowUp'
  )

/** The visiting pet's name, or its species'. */
export const visitingPetName = (visit: PetVisit): string =>
  visit.pet.name || speciesName(visit.pet.species)

/** "Sam's pet · Plan at 9:00 AM". */
export function petVisitDetail(visit: PetVisit): string {
  const time = formatStartTime(visit.startMinutes)
  return i18n.t('pet.visitor.detail', {
    name: visit.buddyName,
    activity: i18n.t(
      visit.activity.type === 'plan'
        ? 'pet.visitor.planAt'
        : 'pet.visitor.followUpAt',
      { time }
    ),
  })
}

/** What the visiting pet says once the User's pet's hearts have floated off. */
export const petVisitLine = (visit: PetVisit): string =>
  i18n.t('pet.visitor.line', { name: visit.buddyName })

/**
 * A visiting pet's long-press menu: what the User does with its buddy today,
 * the buddy, and (`onHide`) hiding the buddy's pet.
 */
export function petVisitMenu(
  visit: PetVisit,
  {
    navigation,
    surface,
    onHide,
  }: {
    navigation: RootStackNavigation
    surface: PetVisitSurface
    onHide?: (visit: PetVisit) => void
  }
): ContextMenuEntries {
  const capture = (action: 'activity' | 'buddy' | 'hide') =>
    analytics.capture('pet_visitor_action', {
      action,
      activity: visit.activity.type,
      from: surface,
    })
  return [
    [
      {
        id: 'pet_visitor_activity',
        title: petVisitActivityTitle(visit.activity),
        // Android has a clock icon and no calendar.
        systemImage: 'clock',
        onPress: () => {
          capture('activity')
          openPetVisitActivity(navigation, visit.activity)
        },
      },
      {
        id: 'pet_visitor_buddy',
        title: i18n.t('pet.visitor.viewBuddy', { name: visit.buddyName }),
        systemImage: 'person.crop.circle',
        onPress: () => {
          capture('buddy')
          navigation.navigate('Buddy', { inboxId: visit.inboxId })
        },
      },
    ],
    onHide && [
      {
        id: 'pet_visitor_hide',
        title: i18n.t('pet.visitor.hide', { name: visit.buddyName }),
        systemImage: 'eye.slash',
        onPress: () => {
          capture('hide')
          onHide(visit)
        },
      },
    ],
  ]
}
