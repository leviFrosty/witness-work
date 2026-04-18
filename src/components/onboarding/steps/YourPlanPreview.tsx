import { View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import moment from 'moment'
import { styles } from '../Onboarding.styles'
import OnboardingNav from '../OnboardingNav'
import Text from '../../MyText'
import Card from '../../Card'
import Wrapper from '../../layout/Wrapper'
import ActionButton from '../../ActionButton'
import SimpleProgressBar from '../../SimpleProgressBar'
import useTheme from '../../../contexts/theme'
import i18n from '../../../lib/locales'
import { usePreferences } from '../../../stores/preferences'
import { isPioneer } from '../../../constants/publisher'

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

const YourPlanPreview = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const { publisher, publisherHours, pioneerStartDate } = usePreferences()
  const intents = useOnboardingIntents()

  const monthlyGoalHours = publisherHours[publisher] ?? 0
  const publisherLabel = i18n.t(publisher)

  const hasIntent = (key: string) => intents.includes(key)
  const showReturnVisits = hasIntent('returnVisits')
  const showTrackTime = hasIntent('trackTime')
  const showMapContacts = hasIntent('mapContacts')
  const showMonthlyGoal = hasIntent('monthlyGoal')
  const showPlanWeek = hasIntent('planWeek')

  const pioneering = isPioneer(publisher) && pioneerStartDate
  const pioneeringLine = pioneering
    ? i18n.t('yourPlanPioneeringSince', {
        date: moment(pioneerStartDate).format('MMM YYYY'),
        days: Math.max(1, moment().diff(moment(pioneerStartDate), 'days')),
      })
    : null

  return (
    <Wrapper
      style={{
        flex: 1,
        paddingHorizontal: 30,
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

          {/* Personalized plan card — headline + subtitle driven by the quiz */}
          <Card style={{ gap: 14, marginBottom: 16 }}>
            <View style={{ gap: 4 }}>
              <Text
                style={{
                  fontSize: 22,
                  fontFamily: theme.fonts.bold,
                  color: theme.colors.text,
                }}
              >
                {publisherLabel}
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: theme.colors.textAlt,
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
                    marginTop: 2,
                  }}
                >
                  {pioneeringLine}
                </Text>
              )}
            </View>

            {/* trackTime: mini progress preview */}
            {showTrackTime && (
              <View
                style={{
                  gap: 8,
                  paddingTop: 10,
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border,
                }}
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
                      fontSize: 13,
                      fontFamily: theme.fonts.semiBold,
                      color: theme.colors.text,
                    }}
                  >
                    {i18n.t('yourPlanTrackTimeHeader')}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: theme.colors.textAlt,
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
              </View>
            )}

            {/* monthlyGoal intent — reinforces the routine line */}
            {showMonthlyGoal && (
              <View
                style={{
                  paddingTop: 10,
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.colors.text,
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('yourPlanMonthlyGoalLine')}
                </Text>
              </View>
            )}

            {/* planWeek intent — week planner teaser */}
            {showPlanWeek && (
              <View
                style={{
                  paddingTop: 10,
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.colors.text,
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('yourPlanPlanWeekLine')}
                </Text>
              </View>
            )}
          </Card>

          {/* returnVisits: sample appointment card */}
          {showReturnVisits && (
            <Card style={{ gap: 6, marginBottom: 16 }}>
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.textAlt,
                  fontFamily: theme.fonts.semiBold,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {i18n.t('yourPlanReturnVisitsHeader')}
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  color: theme.colors.text,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('yourPlanSampleReturnVisitName')}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: theme.colors.accent,
                }}
              >
                {i18n.t('yourPlanSampleReturnVisitNote')}
              </Text>
            </Card>
          )}

          {/* mapContacts: thin map-evoking strip */}
          {showMapContacts && (
            <View
              style={{
                height: 44,
                borderRadius: theme.numbers.borderRadiusMd,
                backgroundColor: theme.colors.tealAlt,
                borderWidth: 1,
                borderColor: theme.colors.teal,
                marginBottom: 16,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                gap: 10,
                overflow: 'hidden',
              }}
            >
              {/* Pin dots to evoke a map preview without rendering one. */}
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: theme.colors.teal,
                  }}
                />
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: theme.colors.accent,
                  }}
                />
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: theme.colors.indigo,
                  }}
                />
              </View>
              <Text
                style={{
                  fontSize: 13,
                  color: theme.colors.text,
                  fontFamily: theme.fonts.semiBold,
                  flex: 1,
                }}
              >
                {i18n.t('yourPlanMapStrip')}
              </Text>
            </View>
          )}

          <Text
            style={{
              fontSize: 15,
              color: theme.colors.textAlt,
              textAlign: 'center',
              marginTop: 8,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('yourPlanReady')}
          </Text>
        </View>
      </KeyboardAwareScrollView>
      <ActionButton onPress={goNext}>{i18n.t('continue')}</ActionButton>
    </Wrapper>
  )
}

export default YourPlanPreview
