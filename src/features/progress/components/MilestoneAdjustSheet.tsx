import { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, View } from 'react-native'
import { Sheet } from 'tamagui'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useNavigation } from '@react-navigation/native'
import _ from 'lodash'
import {
  faCheck,
  faLock,
  faMinus,
  faPlus,
  faTimes,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'

import useTheme from '../../../contexts/theme'
import i18n from '../../../lib/locales'
import { usePreferences } from '../../../stores/preferences'
import useServiceReport from '../../../stores/serviceReport'
import {
  getServiceYearReports,
  getTotalMinutesForServiceYear,
} from '../../../lib/serviceReport'
import {
  DEFAULT_MILESTONES_BY_PUBLISHER,
  getMilestoneHitState,
  validateMilestoneValue,
} from '../../../lib/milestones'
import { RootStackNavigation } from '../../../types/rootStack'

import Text from '../../../components/MyText'
import TextInput from '../../../components/TextInput'
import Button from '../../../components/Button'
import IconButton from '../../../components/IconButton'
import ActionButton from '../../../components/ActionButton'
import { MilestoneProgressBarPreview } from '../../../components/MilestoneProgressBar'

const MILESTONE_STEP = 10

type Props = {
  visible: boolean
  onClose: () => void
}

/**
 * Sort ascending, drop non-positive and over-ceiling values, dedupe. Used
 * whenever the draft mutates so the preview bar stays monotonic without
 * requiring the user to hand-sort.
 */
const sanitizeDraft = (values: number[], yearGoalHours: number): number[] => {
  const ceiling = Math.max(0, yearGoalHours - 1)
  const cleaned: number[] = []
  for (const raw of values) {
    if (typeof raw !== 'number' || !isFinite(raw)) continue
    const clamped = Math.min(Math.max(0, Math.round(raw)), ceiling)
    if (clamped <= 0) continue
    cleaned.push(clamped)
  }
  cleaned.sort((a, b) => a - b)
  return Array.from(new Set(cleaned))
}

/**
 * Determines the service-year end year that matches the rest of the app's
 * convention: months Sep–Dec belong to `year + 1`, Jan–Aug to `year`.
 */
const currentServiceYearEnd = (): number => {
  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()
  return month < 8 ? year : year + 1
}

const MilestoneAdjustSheet = ({ visible, onClose }: Props) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const {
    publisher,
    publisherHours,
    milestoneOverrides,
    setMilestoneOverrides,
    resetMilestoneOverrides,
  } = usePreferences()
  const { serviceReports } = useServiceReport()

  const yearGoalHours = publisherHours[publisher] * 12

  // Seed / re-seed the local draft whenever the sheet opens or the persisted
  // list changes (e.g. Reset to Defaults). We keep a local copy so the user
  // can freely type / reorder without stomping preferences until they tap Done.
  const [draft, setDraft] = useState<number[]>(() =>
    sanitizeDraft(
      milestoneOverrides ?? DEFAULT_MILESTONES_BY_PUBLISHER[publisher],
      yearGoalHours
    )
  )
  // Per-row input buffer so typing doesn't immediately reorder the list — we
  // only sort/dedupe on blur. Keyed by the numeric milestone value at the time
  // the row was rendered.
  const [inputBuffers, setInputBuffers] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!visible) return
    setDraft(
      sanitizeDraft(
        milestoneOverrides ?? DEFAULT_MILESTONES_BY_PUBLISHER[publisher],
        yearGoalHours
      )
    )
    setInputBuffers({})
  }, [visible, milestoneOverrides, publisher, yearGoalHours])

  // Live hours completed for the current service year — same math the rest of
  // the app uses. Must filter to just this service year first; passing the raw
  // store sums every year ever logged.
  const hoursCompleted = useMemo(() => {
    if (yearGoalHours <= 0) return 0
    const serviceYearStart = currentServiceYearEnd() - 1
    const serviceYearReports = getServiceYearReports(
      serviceReports,
      serviceYearStart
    )
    const totalMinutes = getTotalMinutesForServiceYear(
      serviceYearReports,
      serviceYearStart
    )
    return _.round(totalMinutes / 60, 1)
  }, [serviceReports, yearGoalHours])

  const milestonesWithGoal = useMemo(
    () => (yearGoalHours > 0 ? [...draft, yearGoalHours] : draft),
    [draft, yearGoalHours]
  )
  const hitState = useMemo(
    () => getMilestoneHitState(milestonesWithGoal, hoursCompleted),
    [milestonesWithGoal, hoursCompleted]
  )

  const nextMilestoneRemaining =
    hitState.next !== null
      ? _.round(Math.max(0, hitState.next - hoursCompleted), 1)
      : null

  const handleClose = () => {
    onClose()
  }

  const handleDone = () => {
    setMilestoneOverrides(sanitizeDraft(draft, yearGoalHours))
    onClose()
  }

  const handleAdd = () => {
    setDraft((current) => {
      const last = current.length > 0 ? current[current.length - 1] : 0
      const midpoint = Math.round(
        current.length > 0 ? (last + yearGoalHours) / 2 : yearGoalHours / 2
      )
      const candidate = validateMilestoneValue(midpoint, yearGoalHours)
      if (candidate <= 0) return current
      return sanitizeDraft([...current, candidate], yearGoalHours)
    })
  }

  const handleRemove = (value: number) => {
    setDraft((current) =>
      sanitizeDraft(
        current.filter((v) => v !== value),
        yearGoalHours
      )
    )
  }

  const handleStep = (value: number, direction: 1 | -1) => {
    setDraft((current) => {
      const idx = current.indexOf(value)
      if (idx === -1) return current
      const next = validateMilestoneValue(
        value + direction * MILESTONE_STEP,
        yearGoalHours
      )
      const replaced = [...current]
      replaced[idx] = next
      return sanitizeDraft(replaced, yearGoalHours)
    })
  }

  const commitInput = (value: number, raw: string) => {
    const parsed = parseInt(raw, 10)
    setInputBuffers((prev) => {
      const copy = { ...prev }
      delete copy[value]
      return copy
    })
    if (!isFinite(parsed)) return
    const next = validateMilestoneValue(parsed, yearGoalHours)
    setDraft((current) => {
      const idx = current.indexOf(value)
      if (idx === -1) return current
      if (next <= 0) {
        return sanitizeDraft(
          current.filter((_v, i) => i !== idx),
          yearGoalHours
        )
      }
      const replaced = [...current]
      replaced[idx] = next
      return sanitizeDraft(replaced, yearGoalHours)
    })
  }

  const handleReset = () => {
    Alert.alert(
      i18n.t('resetMilestonesConfirm_title'),
      i18n.t('resetMilestonesConfirm_description'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('reset'),
          style: 'destructive',
          onPress: () => {
            resetMilestoneOverrides()
            setDraft(
              sanitizeDraft(
                DEFAULT_MILESTONES_BY_PUBLISHER[publisher],
                yearGoalHours
              )
            )
            setInputBuffers({})
          },
        },
      ]
    )
  }

  const handleNavigateToSettings = () => {
    onClose()
    // Defer navigation so the sheet has a chance to dismiss cleanly before the
    // new screen pushes — avoids the sheet hanging half-open behind a
    // Settings screen push.
    setTimeout(() => {
      navigation.navigate('PreferencesPublisher')
    }, 150)
  }

  const renderSubtitle = () => {
    if (yearGoalHours <= 0) return null
    const hoursUnit = i18n.t('hours_lowercase')
    const parts: string[] = []
    parts.push(`${hoursCompleted} ${hoursUnit} logged`)
    parts.push(
      i18n.t('milestonesHitChip', {
        hit: hitState.totalHit,
        total: hitState.total,
      })
    )
    if (hitState.next !== null && nextMilestoneRemaining !== null) {
      parts.push(
        i18n.t('nextMilestoneLabel', {
          hours: hitState.next,
          remaining: nextMilestoneRemaining,
        })
      )
    }
    return parts.join(' · ')
  }

  const noGoalSet = yearGoalHours <= 0

  return (
    <Sheet
      open={visible}
      onOpenChange={(o: boolean) => {
        if (!o) handleClose()
      }}
      dismissOnSnapToBottom
      modal
      snapPoints={[85]}
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        <View
          style={{
            flex: 1,
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 24,
            gap: 18,
            backgroundColor: theme.colors.backgroundLighter,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontSize: theme.fontSize('xl'),
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.text,
              }}
            >
              {i18n.t('milestones')}
            </Text>
            {noGoalSet ? (
              <IconButton
                noTransform
                icon={faTimes}
                size='xl'
                onPress={handleClose}
              />
            ) : (
              <Button noTransform onPress={handleDone} hitSlop={10}>
                <Text
                  style={{
                    color: theme.colors.accent,
                    fontSize: theme.fontSize('md'),
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('done')}
                </Text>
              </Button>
            )}
          </View>

          {noGoalSet ? (
            <View style={{ gap: 12 }}>
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('md'),
                  lineHeight: 22,
                }}
              >
                {i18n.t('yearGoalSetInSettings')}
              </Text>
              <ActionButton noTransform onPress={handleNavigateToSettings}>
                <Text
                  style={{
                    color: theme.colors.textInverse,
                    fontSize: theme.fontSize('md'),
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('adjustMilestones')}
                </Text>
              </ActionButton>
            </View>
          ) : (
            <KeyboardAwareScrollView
              keyboardShouldPersistTaps='handled'
              contentContainerStyle={{ gap: 18, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Intro copy */}
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                  lineHeight: 20,
                }}
              >
                {i18n.t('milestonesOrderHint')}
              </Text>

              {/* Preview bar + subtitle */}
              <View style={{ gap: 8 }}>
                <MilestoneProgressBarPreview
                  milestones={milestonesWithGoal}
                  hoursCompleted={hoursCompleted}
                  yearGoalHours={yearGoalHours}
                />
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('xs'),
                  }}
                >
                  {renderSubtitle()}
                </Text>
              </View>

              {/* Editable rows */}
              <View style={{ gap: 10 }}>
                {draft.map((value) => {
                  const isHit = hitState.hit.includes(value)
                  const isNext = hitState.next === value
                  const buffer = inputBuffers[value]
                  const displayValue =
                    buffer !== undefined ? buffer : String(value)

                  return (
                    <View
                      key={`milestone-${value}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderRadius: theme.numbers.borderRadiusMd,
                        backgroundColor: theme.colors.background,
                      }}
                    >
                      {/* Hit indicator */}
                      <HitIndicator
                        state={isHit ? 'hit' : isNext ? 'next' : 'future'}
                      />

                      {/* Stepper */}
                      <Pressable
                        onPress={() => handleStep(value, -1)}
                        hitSlop={8}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: theme.numbers.borderRadiusSm,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: theme.colors.card,
                        }}
                      >
                        <FontAwesomeIcon
                          icon={faMinus}
                          size={theme.fontSize('xs')}
                          style={{ color: theme.colors.textAlt }}
                        />
                      </Pressable>

                      {/* Numeric input */}
                      <View
                        style={{
                          minWidth: 56,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <TextInput
                          value={displayValue}
                          keyboardType='number-pad'
                          textAlign='center'
                          onChangeText={(text) =>
                            setInputBuffers((prev) => ({
                              ...prev,
                              [value]: text.replace(/[^0-9]/g, ''),
                            }))
                          }
                          onBlur={() => commitInput(value, displayValue)}
                          onSubmitEditing={() =>
                            commitInput(value, displayValue)
                          }
                          style={{
                            color: theme.colors.text,
                            fontSize: theme.fontSize('md'),
                            fontFamily: theme.fonts.semiBold,
                            padding: 4,
                            minWidth: 48,
                          }}
                        />
                      </View>

                      <Pressable
                        onPress={() => handleStep(value, 1)}
                        hitSlop={8}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: theme.numbers.borderRadiusSm,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: theme.colors.card,
                        }}
                      >
                        <FontAwesomeIcon
                          icon={faPlus}
                          size={theme.fontSize('xs')}
                          style={{ color: theme.colors.textAlt }}
                        />
                      </Pressable>

                      <Text
                        style={{
                          color: theme.colors.textAlt,
                          fontSize: theme.fontSize('sm'),
                        }}
                      >
                        {i18n.t('hours_lowercase')}
                      </Text>

                      {/* Remove */}
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <IconButton
                          noTransform
                          icon={faTimes}
                          size='sm'
                          onPress={() => handleRemove(value)}
                        />
                      </View>
                    </View>
                  )
                })}

                {/* Locked year-goal row */}
                <Pressable
                  onPress={handleNavigateToSettings}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    borderRadius: theme.numbers.borderRadiusMd,
                    backgroundColor: theme.colors.card,
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FontAwesomeIcon
                      icon={faLock}
                      size={theme.fontSize('sm')}
                      style={{ color: theme.colors.textAlt }}
                    />
                  </View>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: theme.fontSize('md'),
                      fontFamily: theme.fonts.semiBold,
                      minWidth: 56,
                      textAlign: 'center',
                    }}
                  >
                    {yearGoalHours}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('sm'),
                    }}
                  >
                    {i18n.t('hours_lowercase')}
                  </Text>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text
                      style={{
                        color: theme.colors.textAlt,
                        fontSize: theme.fontSize('xs'),
                        fontFamily: theme.fonts.semiBold,
                        letterSpacing: 0.5,
                      }}
                      numberOfLines={1}
                    >
                      {i18n.t('yearGoalSetInSettings')}
                    </Text>
                  </View>
                </Pressable>
              </View>

              {/* Footer actions */}
              <View style={{ gap: 10 }}>
                <Button
                  noTransform
                  onPress={handleAdd}
                  variant='outline'
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: theme.numbers.borderRadiusMd,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.accent,
                      fontSize: theme.fontSize('md'),
                      fontFamily: theme.fonts.semiBold,
                    }}
                  >
                    {i18n.t('addMilestone')}
                  </Text>
                </Button>
                <Button noTransform onPress={handleReset} hitSlop={10}>
                  <Text
                    style={{
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('sm'),
                      textAlign: 'center',
                      textDecorationLine: 'underline',
                    }}
                  >
                    {i18n.t('resetToDefaults')}
                  </Text>
                </Button>
              </View>
            </KeyboardAwareScrollView>
          )}
        </View>
      </Sheet.Frame>
    </Sheet>
  )
}

/**
 * Small visual indicator mirroring the three milestone-row states from the
 * wireframe: hit (filled accent circle with check), next (hollow ring), and
 * future (subdued dot). Pure presentational — state is computed upstream.
 */
const HitIndicator = ({ state }: { state: 'hit' | 'next' | 'future' }) => {
  const theme = useTheme()
  const size = 22
  if (state === 'hit') {
    return (
      <View
        style={[
          styles.indicator,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: theme.colors.accent,
          },
        ]}
      >
        <FontAwesomeIcon
          icon={faCheck}
          size={theme.fontSize('xs')}
          style={{ color: theme.colors.textInverse }}
        />
      </View>
    )
  }
  if (state === 'next') {
    return (
      <View
        style={[
          styles.indicator,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 2,
            borderColor: theme.colors.accent,
          },
        ]}
      />
    )
  }
  return (
    <View
      style={[
        styles.indicator,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.colors.border,
        },
      ]}
    />
  )
}

const styles = StyleSheet.create({
  indicator: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default MilestoneAdjustSheet
