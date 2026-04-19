import { View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { IconProp } from '@fortawesome/fontawesome-svg-core'
import {
  faStopwatch,
  faComments,
  faCalendar,
  faBullseye,
  faMap,
  faUser,
} from '@fortawesome/free-solid-svg-icons'
import moment from 'moment'
import { styles } from '../Onboarding.styles'
import OnboardingNav from '../OnboardingNav'
import Text from '../../MyText'
import Card from '../../Card'
import Wrapper from '../../layout/Wrapper'
import ActionButton from '../../ActionButton'
import NotificationPreview from '../NotificationPreview'
import SimpleProgressBar from '../../SimpleProgressBar'
import useTheme from '../../../contexts/theme'
import i18n, { TranslationKey } from '../../../lib/locales'
import { OnboardingIntent, usePreferences } from '../../../stores/preferences'
import { isPioneer } from '../../../constants/publisher'
import { useMarkerColors } from '../../../hooks/useMarkerColors'
import { Theme } from '../../../types/theme'
import { ReactNode } from 'react'

interface Props {
  goBack: () => void
  goNext: () => void
}

/**
 * Safely reads `onboardingIntents` from the preferences store. The preference
 * is added in Phase 2a (sibling worktree), so it may not exist in this
 * worktree's store shape yet. Fall back to an empty array when missing so the
 * screen still renders a meaningful publisher-only preview.
 */
const useOnboardingIntents = (): string[] => {
  const state = usePreferences() as unknown as {
    onboardingIntents?: unknown
  }
  const raw = state.onboardingIntents
  return Array.isArray(raw) ? (raw as string[]) : []
}

type IntentMeta = {
  id: OnboardingIntent
  icon: IconProp
  color: (t: Theme) => string
  tint: (t: Theme) => string
  headerKey: TranslationKey
  blurbKey: TranslationKey
}

const INTENT_META: Record<OnboardingIntent, IntentMeta> = {
  trackTime: {
    id: 'trackTime',
    icon: faStopwatch,
    color: (t) => t.colors.purple,
    tint: (t) => t.colors.purpleAlt,
    headerKey: 'yourPlanTrackTimeHeader',
    blurbKey: 'yourPlanTrackTimeBlurb',
  },
  returnVisits: {
    id: 'returnVisits',
    icon: faComments,
    color: (t) => t.colors.cyan,
    tint: (t) => t.colors.cyanAlt,
    headerKey: 'yourPlanReturnVisitsHeader',
    blurbKey: 'yourPlanReturnVisitsBlurb',
  },
  planWeek: {
    id: 'planWeek',
    icon: faCalendar,
    color: (t) => t.colors.indigo,
    tint: (t) => t.colors.indigoAlt,
    headerKey: 'yourPlanPlanWeekHeader',
    blurbKey: 'yourPlanPlanWeekBlurb',
  },
  monthlyGoal: {
    id: 'monthlyGoal',
    icon: faBullseye,
    color: (t) => t.colors.rose,
    tint: (t) => t.colors.roseAlt,
    headerKey: 'yourPlanMonthlyGoalHeader',
    blurbKey: 'yourPlanMonthlyGoalBlurb',
  },
  mapContacts: {
    id: 'mapContacts',
    icon: faMap,
    color: (t) => t.colors.orange,
    tint: (t) => t.colors.orangeAlt,
    headerKey: 'yourPlanMapHeader',
    blurbKey: 'yourPlanMapBlurb',
  },
}

const INTENT_ORDER: OnboardingIntent[] = [
  'trackTime',
  'returnVisits',
  'planWeek',
  'monthlyGoal',
  'mapContacts',
]

interface ResultCardProps {
  theme: Theme
  icon: IconProp
  accent: string
  tint: string
  header: string
  blurb: string
  children?: ReactNode
}

const ResultCard = ({
  theme,
  icon,
  accent,
  tint,
  header,
  blurb,
  children,
}: ResultCardProps) => (
  <Card style={{ padding: 0, gap: 0, overflow: 'hidden', marginBottom: 14 }}>
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 14,
        padding: 16,
        backgroundColor: tint,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <FontAwesomeIcon
          icon={icon}
          size={18}
          color={theme.colors.textInverse}
        />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={{
            fontSize: 17,
            fontFamily: theme.fonts.bold,
            color: theme.colors.text,
            lineHeight: 22,
          }}
        >
          {header}
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: theme.colors.textAlt,
            lineHeight: 18,
          }}
        >
          {blurb}
        </Text>
      </View>
    </View>
    {children ? <View style={{ padding: 16, gap: 10 }}>{children}</View> : null}
  </Card>
)

const YourPlanPreview = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const { publisher, publisherHours, pioneerStartDate } = usePreferences()
  const intents = useOnboardingIntents()
  const markerColors = useMarkerColors()

  const monthlyGoalHours = publisherHours[publisher] ?? 0
  const publisherLabel = i18n.t(publisher)

  const pioneering = isPioneer(publisher) && pioneerStartDate
  const pioneeringLine = pioneering
    ? i18n.t('yourPlanPioneeringSince', {
        date: moment(pioneerStartDate).format('MMM YYYY'),
        days: Math.max(1, moment().diff(moment(pioneerStartDate), 'days')),
      })
    : null

  const selectedIntents = INTENT_ORDER.filter((id) => intents.includes(id))

  return (
    <Wrapper
      style={{
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 60,
      }}
    >
      <OnboardingNav goBack={goBack} />
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: 30,
          paddingBottom: 20,
        }}
        showsVerticalScrollIndicator={false}
        enableOnAndroid={true}
      >
        <View style={[styles.stepContentContainer, { marginRight: 0 }]}>
          <Text style={styles.stepTitle}>{i18n.t('yourPlanTitle')}</Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textAlt,
              marginTop: -10,
              marginBottom: 24,
              lineHeight: 20,
            }}
          >
            {i18n.t('yourPlanIntro')}
          </Text>

          {/* Foundation — publisher role */}
          <Card
            style={{
              padding: 0,
              gap: 0,
              overflow: 'hidden',
              marginBottom: 14,
              borderWidth: 1,
              borderColor: theme.colors.accentAlt,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                padding: 16,
                backgroundColor: theme.colors.accentTranslucent,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: theme.colors.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FontAwesomeIcon
                  icon={faUser}
                  size={18}
                  color={theme.colors.textInverse}
                />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.textAlt,
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                  }}
                >
                  {i18n.t('yourPlanRoleEyebrow')}
                </Text>
                <Text
                  style={{
                    fontSize: 22,
                    fontFamily: theme.fonts.bold,
                    color: theme.colors.text,
                    lineHeight: 28,
                  }}
                >
                  {publisherLabel}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.colors.textAlt,
                    lineHeight: 18,
                  }}
                >
                  {i18n.t('yourPlanRoleBlurb', { role: publisherLabel })}
                </Text>
              </View>
            </View>
            <View style={{ padding: 16, gap: 8 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                }}
              >
                {monthlyGoalHours > 0
                  ? i18n.t('yourPlanMonthlyGoal', { hours: monthlyGoalHours })
                  : i18n.t('yourPlanNoGoal')}
              </Text>
              {pioneeringLine && (
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.colors.accent,
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {pioneeringLine}
                </Text>
              )}
            </View>
          </Card>

          {/* Per-intent result cards */}
          {selectedIntents.map((id) => {
            const meta = INTENT_META[id]
            const accent = meta.color(theme)
            const tint = meta.tint(theme)
            const header = i18n.t(meta.headerKey)
            const blurb = i18n.t(meta.blurbKey)

            if (id === 'trackTime') {
              return (
                <ResultCard
                  key={id}
                  theme={theme}
                  icon={meta.icon}
                  accent={accent}
                  tint={tint}
                  header={header}
                  blurb={blurb}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: theme.colors.textAlt,
                        fontFamily: theme.fonts.semiBold,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      {i18n.t('yourPlanTrackTimeProgressLabel')}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        color: theme.colors.text,
                        fontFamily: theme.fonts.semiBold,
                      }}
                    >
                      {monthlyGoalHours > 0
                        ? i18n.t('yourPlanTrackTimeValue', {
                            hours: monthlyGoalHours,
                          })
                        : i18n.t('yourPlanTrackTimeValueNoGoal')}
                    </Text>
                  </View>
                  <SimpleProgressBar
                    percentage={0}
                    height={8}
                    animated={false}
                  />
                </ResultCard>
              )
            }

            if (id === 'returnVisits') {
              return (
                <ResultCard
                  key={id}
                  theme={theme}
                  icon={meta.icon}
                  accent={accent}
                  tint={tint}
                  header={header}
                  blurb={blurb}
                >
                  <View
                    style={{
                      borderRadius: theme.numbers.borderRadiusMd,
                      borderLeftWidth: 3,
                      borderLeftColor: accent,
                      backgroundColor: theme.colors.backgroundLighter,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      gap: 2,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        color: theme.colors.text,
                        fontFamily: theme.fonts.semiBold,
                      }}
                    >
                      {i18n.t('yourPlanSampleReturnVisitName')}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: theme.colors.textAlt,
                      }}
                    >
                      {i18n.t('yourPlanSampleReturnVisitNote')}
                    </Text>
                  </View>
                  <NotificationPreview />
                </ResultCard>
              )
            }

            if (id === 'planWeek') {
              return (
                <ResultCard
                  key={id}
                  theme={theme}
                  icon={meta.icon}
                  accent={accent}
                  tint={tint}
                  header={header}
                  blurb={blurb}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: theme.colors.text,
                    }}
                  >
                    {i18n.t('yourPlanPlanWeekLine')}
                  </Text>
                </ResultCard>
              )
            }

            if (id === 'monthlyGoal') {
              return (
                <ResultCard
                  key={id}
                  theme={theme}
                  icon={meta.icon}
                  accent={accent}
                  tint={tint}
                  header={header}
                  blurb={blurb}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: theme.colors.text,
                    }}
                  >
                    {i18n.t('yourPlanMonthlyGoalLine')}
                  </Text>
                </ResultCard>
              )
            }

            if (id === 'mapContacts') {
              const pinColors = [
                markerColors.withinThePastWeek,
                markerColors.longerThanAWeekAgo,
                markerColors.longerThanAMonthAgo,
                markerColors.noConversations,
              ]
              return (
                <ResultCard
                  key={id}
                  theme={theme}
                  icon={meta.icon}
                  accent={accent}
                  tint={tint}
                  header={header}
                  blurb={blurb}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {pinColors.map((color, idx) => (
                        <View
                          key={idx}
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: color,
                          }}
                        />
                      ))}
                    </View>
                    <Text
                      style={{
                        fontSize: 12,
                        color: theme.colors.textAlt,
                        flex: 1,
                      }}
                    >
                      {i18n.t('yourPlanMapStrip')}
                    </Text>
                  </View>
                </ResultCard>
              )
            }

            return null
          })}
        </View>
      </KeyboardAwareScrollView>
      <ActionButton onPress={goNext}>{i18n.t('continue')}</ActionButton>
    </Wrapper>
  )
}

export default YourPlanPreview
