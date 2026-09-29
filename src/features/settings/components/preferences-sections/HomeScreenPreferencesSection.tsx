import { analytics } from '@/lib/analytics'
import InfoPopover from '@/components/ui/InfoPopover'
import { View } from 'react-native'
import Switch from '@/components/ui/Switch'
import i18n from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import {
  getEffectiveHomeScreenOrder,
  HomeScreenElementKey,
  usePreferences,
} from '@/stores/preferences'
import usePublisher from '@/hooks/usePublisher'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import XView from '@/components/ui/layout/XView'
import useDevice from '@/hooks/useDevice'
import ReorderControls from '@/features/settings/components/shared/ReorderControls'
import { reorderMenuActions } from '@/features/settings/components/shared/reorderMenuActions'
import ContextMenu from '@/components/ui/ContextMenu'
import { useMemo } from 'react'

const HideDonateHeart = () => {
  const { hideDonateHeart, set } = usePreferences()

  return (
    <InputRowSwitch
      label={i18n.t('hideDonateHeart')}
      value={hideDonateHeart}
      onValueChange={(value) => {
        analytics.capture('supporter_heart_visibility_changed', {
          hidden: value,
        })
        set({ hideDonateHeart: value })
      }}
    />
  )
}

const HideSupporterNudge = () => {
  const { hideSupporterNudge, set } = usePreferences()
  const { entryMode } = usePublisher()

  const lastInSection = entryMode === 'checkbox'

  return (
    <InputRowSwitch
      lastInSection={lastInSection}
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
  )
}

const HomeElements = () => {
  const { homeScreenElements, homeScreenElementsOrder, set } = usePreferences()
  const { showsTimer, hasAnnualGoal } = usePublisher()
  const { isTablet } = useDevice()
  const theme = useTheme()

  const effectiveOrder = useMemo(
    () => getEffectiveHomeScreenOrder(homeScreenElementsOrder),
    [homeScreenElementsOrder]
  )

  // Hide rows whose capability isn't available — but leave them in the stored
  // order so toggling capability later (e.g. enabling timer) restores the
  // user's saved position for that row.
  const visibleKeys = useMemo(
    () =>
      effectiveOrder.filter((k) => {
        if (k === 'tabletServiceYearSummary') return isTablet && hasAnnualGoal
        if (k === 'timer') return showsTimer
        return true
      }),
    [effectiveOrder, isTablet, hasAnnualGoal, showsTimer]
  )

  const labelFor = (key: HomeScreenElementKey): string => {
    switch (key) {
      case 'approachingConversations':
        return i18n.t('approachingConversations')
      case 'tabletServiceYearSummary':
        return i18n.t('serviceYearSummary')
      case 'serviceReport':
        return i18n.t('serviceReport')
      case 'thisWeek':
        return i18n.t('thisWeek')
      case 'timer':
        return i18n.t('timer')
      case 'didYouKnow':
        return i18n.t('didYouKnow_kicker')
    }
  }

  const descriptionFor = (key: HomeScreenElementKey): string | null => {
    if (key === 'approachingConversations')
      return i18n.t('approachingConversations_description')
    return null
  }

  const setVisibility = (key: HomeScreenElementKey, value: boolean) => {
    set({
      homeScreenElements: {
        ...homeScreenElements,
        [key]: value,
      },
    })
  }

  const move = (visibleIdx: number, direction: -1 | 1) => {
    const target = visibleIdx + direction
    if (target < 0 || target >= visibleKeys.length) return
    const a = visibleKeys[visibleIdx]
    const b = visibleKeys[target]
    const next = [...effectiveOrder]
    const ai = next.indexOf(a)
    const bi = next.indexOf(b)
    if (ai < 0 || bi < 0) return
    ;[next[ai], next[bi]] = [next[bi], next[ai]]
    set({ homeScreenElementsOrder: next })
  }

  // Moves past hidden-capability rows too, keeping them where they were
  // relative to their neighbors.
  const moveTo = (visibleIdx: number, target: number) => {
    if (Math.abs(target - visibleIdx) === 1) {
      move(visibleIdx, target > visibleIdx ? 1 : -1)
      return
    }
    const key = visibleKeys[visibleIdx]
    const anchor = visibleKeys[target]
    const next = effectiveOrder.filter((k) => k !== key)
    const anchorIdx = next.indexOf(anchor)
    if (!key || anchorIdx < 0) return
    next.splice(target < visibleIdx ? anchorIdx : anchorIdx + 1, 0, key)
    set({ homeScreenElementsOrder: next })
  }

  return (
    <View
      style={{
        paddingHorizontal: 12,
        borderBottomColor: theme.colors.border,
        borderBottomWidth: 1,
        paddingVertical: 16,
      }}
    >
      <View style={{ paddingBottom: 15, gap: 5 }}>
        <Text style={{ fontFamily: theme.fonts.semiBold }}>
          {i18n.t('sectionsVisibility')}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t('sectionsVisibility_description')}
        </Text>
      </View>
      <View style={{ gap: 0 }}>
        {visibleKeys.map((key, idx) => {
          const isFirst = idx === 0
          const isLast = idx === visibleKeys.length - 1
          const isOn =
            (homeScreenElements as Record<string, boolean>)[key] ?? true
          const description = descriptionFor(key)
          return (
            <View
              key={key}
              style={{
                minHeight: 76,
                paddingVertical: 16,
                borderBottomWidth: isLast ? 0 : 1,
                borderBottomColor: theme.colors.border,
              }}
            >
              <XView style={{ justifyContent: 'space-between', gap: 6 }}>
                <ReorderControls
                  onMoveUp={isFirst ? undefined : () => move(idx, -1)}
                  onMoveDown={isLast ? undefined : () => move(idx, 1)}
                />
                <View
                  style={{
                    flex: 1,
                    minWidth: 0,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  {/* Long-press the label; the arrows, info button, and
                      switch stay outside the menu's trigger. */}
                  <ContextMenu
                    style={{ flexShrink: 1 }}
                    analyticsSurface='home_screen_preferences_row'
                    actions={reorderMenuActions({
                      index: idx,
                      count: visibleKeys.length,
                      moveTo: (target) => moveTo(idx, target),
                      visible: isOn,
                      setVisible: (value) => setVisibility(key, value),
                    })}
                  >
                    <Text style={{ paddingVertical: 8 }}>{labelFor(key)}</Text>
                  </ContextMenu>
                  {description !== null && (
                    <InfoPopover
                      title={labelFor(key)}
                      description={description}
                      inline
                    />
                  )}
                </View>
                <Switch
                  accessibilityLabel={labelFor(key)}
                  value={isOn}
                  onValueChange={(value) => setVisibility(key, value)}
                />
              </XView>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const HomeScreenPreferencesSection = () => {
  return (
    <View>
      <Section>
        <HomeElements />
        <HideDonateHeart />
        <HideSupporterNudge />
      </Section>
    </View>
  )
}

export default HomeScreenPreferencesSection
