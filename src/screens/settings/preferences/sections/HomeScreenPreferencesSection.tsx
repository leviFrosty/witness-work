import { Switch, View } from 'react-native'
import i18n from '../../../../lib/locales'
import Section from '../../../../components/inputs/Section'
import InputRowContainer from '../../../../components/inputs/InputRowContainer'
import {
  getEffectiveHomeScreenOrder,
  HomeScreenElementKey,
  usePreferences,
} from '../../../../stores/preferences'
import usePublisher from '../../../../hooks/usePublisher'
import Text from '../../../../components/MyText'
import useTheme from '../../../../contexts/theme'
import XView from '../../../../components/layout/XView'
import { rowPaddingVertical } from '../../../../constants/Inputs'
import useDevice from '../../../../hooks/useDevice'
import IconButton from '../../../../components/IconButton'
import { faArrowDown, faArrowUp } from '@fortawesome/free-solid-svg-icons'
import { useMemo } from 'react'

const DetailedProgressBar = () => {
  const { displayDetailsOnProgressBarHomeScreen, set } = usePreferences()
  const { entryMode } = usePublisher()
  const theme = useTheme()

  if (entryMode === 'checkbox') return null

  return (
    <InputRowContainer
      lastInSection
      style={{
        flexDirection: 'column',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <View
        style={{
          width: '100%',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {i18n.t('detailedProgressBar')}
        </Text>
        <Switch
          value={displayDetailsOnProgressBarHomeScreen}
          onValueChange={(value) =>
            set({ displayDetailsOnProgressBarHomeScreen: value })
          }
        />
      </View>
      <Text
        style={{
          fontSize: theme.fontSize('xs'),
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t('detailedProgressBar_description')}
      </Text>
    </InputRowContainer>
  )
}

const HideDonateHeart = () => {
  const { hideDonateHeart, set } = usePreferences()

  return (
    <InputRowContainer
      label={i18n.t('hideDonateHeart')}
      style={{ justifyContent: 'space-between' }}
    >
      <Switch
        value={hideDonateHeart}
        onValueChange={(value) => set({ hideDonateHeart: value })}
      />
    </InputRowContainer>
  )
}

const HideSupporterNudge = () => {
  const { hideSupporterNudge, set } = usePreferences()
  const { entryMode } = usePublisher()

  const lastInSection = entryMode === 'checkbox'

  return (
    <InputRowContainer
      lastInSection={lastInSection}
      label={i18n.t('hideSupporterNudge')}
      style={{ justifyContent: 'space-between' }}
    >
      <Switch
        value={hideSupporterNudge}
        onValueChange={(value) => set({ hideSupporterNudge: value })}
      />
    </InputRowContainer>
  )
}

const HomeElements = () => {
  const { homeScreenElements, homeScreenElementsOrder, set } = usePreferences()
  const { showsTimer, hasAnnualGoal, entryMode } = usePublisher()
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
        if (k === 'contributionGraph') return entryMode === 'hours'
        return true
      }),
    [effectiveOrder, isTablet, hasAnnualGoal, showsTimer, entryMode]
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
      case 'contributionGraph':
        return i18n.t('profileActivityTitle')
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

  return (
    <View
      style={{
        paddingRight: 20,
        borderBottomColor: theme.colors.border,
        borderBottomWidth: 1,
        paddingVertical: rowPaddingVertical,
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
      <View style={{ paddingLeft: 20, gap: 12 }}>
        {visibleKeys.map((key, idx) => {
          const isFirst = idx === 0
          const isLast = idx === visibleKeys.length - 1
          const isOn =
            (homeScreenElements as Record<string, boolean>)[key] ?? true
          const description = descriptionFor(key)
          return (
            <View key={key}>
              <XView style={{ justifyContent: 'space-between', gap: 6 }}>
                <XView style={{ gap: 8 }}>
                  <IconButton
                    icon={faArrowUp}
                    onPress={isFirst ? undefined : () => move(idx, -1)}
                    color={isFirst ? theme.colors.border : theme.colors.textAlt}
                    // Asymmetric slop so the up arrow's right-slop and the
                    // down arrow's left-slop don't overlap (RN resolves
                    // overlapping siblings to the later one, which made
                    // taps on the inner half of the up arrow fire down).
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 0 }}
                  />
                  <IconButton
                    icon={faArrowDown}
                    onPress={isLast ? undefined : () => move(idx, 1)}
                    color={isLast ? theme.colors.border : theme.colors.textAlt}
                    hitSlop={{ top: 10, bottom: 10, left: 0, right: 10 }}
                  />
                </XView>
                <Text style={{ flex: 1, marginLeft: 8 }}>{labelFor(key)}</Text>
                <Switch
                  value={isOn}
                  onValueChange={(value) => setVisibility(key, value)}
                />
              </XView>
              {description !== null && (
                <Text
                  style={{
                    fontSize: theme.fontSize('xs'),
                    color: theme.colors.textAlt,
                  }}
                >
                  {description}
                </Text>
              )}
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
        <DetailedProgressBar />
      </Section>
    </View>
  )
}

export default HomeScreenPreferencesSection
