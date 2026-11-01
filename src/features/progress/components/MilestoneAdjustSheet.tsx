import {
  Check as CheckIcon,
  Lock as LockIcon,
  Minus as MinusIcon,
  Plus as PlusIcon,
  X as XIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, StyleSheet, View } from 'react-native'
import Sheet from '@/components/ui/Sheet'
import { useNavigation } from '@react-navigation/native'

import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { parseIntegerInput, toAsciiDigits } from '@/lib/digits'
import { formatPlainNumber, localizeAppDigits } from '@/lib/numbers'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import { getTotalMinutesForServiceYear } from '@/lib/serviceReport'
import {
  getServiceYearFromDate,
  getServiceYearReports,
} from '@/lib/serviceYear'
import {
  DEFAULT_MILESTONES_BY_PUBLISHER,
  getMilestoneHitState,
  validateMilestoneValue,
} from '@/lib/milestones'
import { useFormattedMinutes } from '@/lib/minutes'
import confirmDestructive from '@/lib/confirmDestructive'
import { RootStackNavigation } from '@/types/rootStack'

import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import { touchTargetFrame } from '@/components/ui/touchTarget'
import ActionButton from '@/components/ui/ActionButton'
import { MilestoneProgressBarPreview } from '@/components/MilestoneProgressBar'
import usePublisher from '@/hooks/usePublisher'
import useRoleForMonth from '@/hooks/useRoleForMonth'
import { useShallow } from 'zustand/react/shallow'
import { tracking } from '@/lib/tracking'

const MILESTONE_STEP = 10

const STEPPER_SIZE = 28

type Props = {
  visible: boolean
  onClose: () => void
}

const sanitizeDraft = (values: number[], annualGoalHours: number): number[] => {
  const ceiling = Math.max(0, annualGoalHours - 1)
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

const MilestoneAdjustSheet = ({ visible, onClose }: Props) => {
  const theme = useTheme()

  const openSettings = useRef(false)
  const navigation = useNavigation<RootStackNavigation>()
  const {
    milestoneOverrides,
    setMilestoneOverrides,
    resetMilestoneOverrides,
    overrideCreditLimit,
    customCreditLimitHours,
  } = usePreferences(
    useShallow((s) => ({
      milestoneOverrides: s.milestoneOverrides,
      setMilestoneOverrides: s.setMilestoneOverrides,
      resetMilestoneOverrides: s.resetMilestoneOverrides,
      overrideCreditLimit: s.overrideCreditLimit,
      customCreditLimitHours: s.customCreditLimitHours,
    }))
  )
  const { serviceReports } = useServiceReport()

  const { type: role, annualGoalHours } = usePublisher()
  const roleFor = useRoleForMonth()

  const [draft, setDraft] = useState<number[]>(() =>
    sanitizeDraft(
      milestoneOverrides ?? DEFAULT_MILESTONES_BY_PUBLISHER[role],
      annualGoalHours
    )
  )

  const [inputBuffers, setInputBuffers] = useState<Record<number, string>>({})
  const [lockedRowHovered, setLockedRowHovered] = useState(false)

  useEffect(() => {
    if (!visible) return
    setDraft(
      sanitizeDraft(
        milestoneOverrides ?? DEFAULT_MILESTONES_BY_PUBLISHER[role],
        annualGoalHours
      )
    )
    setInputBuffers({})
  }, [visible, milestoneOverrides, role, annualGoalHours])

  const completedMinutes = useMemo(() => {
    if (annualGoalHours <= 0) return 0
    const serviceYearStart = getServiceYearFromDate(new Date())
    const serviceYearReports = getServiceYearReports(
      serviceReports,
      serviceYearStart
    )
    return getTotalMinutesForServiceYear(
      serviceYearReports,
      serviceYearStart,
      roleFor,
      { enabled: overrideCreditLimit, customLimitHours: customCreditLimitHours }
    )
  }, [
    serviceReports,
    annualGoalHours,
    roleFor,
    overrideCreditLimit,
    customCreditLimitHours,
  ])

  const milestonesWithGoal = useMemo(
    () => (annualGoalHours > 0 ? [...draft, annualGoalHours] : draft),
    [draft, annualGoalHours]
  )
  const hitState = useMemo(
    () => getMilestoneHitState(milestonesWithGoal, completedMinutes),
    [milestonesWithGoal, completedMinutes]
  )

  const nextMilestoneRemainingMinutes =
    hitState.next !== null
      ? Math.max(0, Math.round(hitState.next * 60 - completedMinutes))
      : null
  const nextMilestoneRemainingDisplay = useFormattedMinutes(
    nextMilestoneRemainingMinutes ?? 0
  )
  const completedHoursDisplay = useFormattedMinutes(completedMinutes)

  const handleClose = () => {
    onClose()
  }

  const handleDone = () => {
    setMilestoneOverrides(sanitizeDraft(draft, annualGoalHours))
    onClose()
  }

  const handleAdd = () => {
    setDraft((current) => {
      const last = current.length > 0 ? current[current.length - 1] : 0
      const midpoint = Math.round(
        current.length > 0 ? (last + annualGoalHours) / 2 : annualGoalHours / 2
      )
      const candidate = validateMilestoneValue(midpoint, annualGoalHours)
      if (candidate <= 0) return current
      return sanitizeDraft([...current, candidate], annualGoalHours)
    })
  }

  const removeMilestone = (value: number) => {
    setDraft((current) =>
      sanitizeDraft(
        current.filter((v) => v !== value),
        annualGoalHours
      )
    )
  }

  const confirmRemoveMilestone = (value: number) => {
    confirmDestructive({
      title: i18n.t('removeMilestone_title', { hours: value }),
      description: i18n.t('removeMilestone_description'),
      confirmLabel: i18n.t('remove'),
      onConfirm: () => removeMilestone(value),
    })
  }

  const stepperStyle = {
    width: STEPPER_SIZE,
    height: STEPPER_SIZE,
    borderRadius: theme.numbers.borderRadiusSm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.card,
  } as const

  const handleStep = (value: number, direction: 1 | -1) => {
    setDraft((current) => {
      const idx = current.indexOf(value)
      if (idx === -1) return current
      const next = validateMilestoneValue(
        value + direction * MILESTONE_STEP,
        annualGoalHours
      )
      const replaced = [...current]
      replaced[idx] = next
      return sanitizeDraft(replaced, annualGoalHours)
    })
  }

  const commitInput = (value: number, raw: string) => {
    const parsed = parseIntegerInput(raw) ?? NaN
    setInputBuffers((prev) => {
      const copy = { ...prev }
      delete copy[value]
      return copy
    })
    if (!isFinite(parsed)) return
    const next = validateMilestoneValue(parsed, annualGoalHours)

    if (next <= 0) {
      if (draft.includes(value)) confirmRemoveMilestone(value)
      return
    }
    setDraft((current) => {
      const idx = current.indexOf(value)
      if (idx === -1) return current
      const replaced = [...current]
      replaced[idx] = next
      return sanitizeDraft(replaced, annualGoalHours)
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
                DEFAULT_MILESTONES_BY_PUBLISHER[role],
                annualGoalHours
              )
            )
            setInputBuffers({})
          },
        },
      ]
    )
  }

  const handleNavigateToSettings = () => {
    openSettings.current = true
    onClose()
  }

  const renderSubtitle = () => {
    if (annualGoalHours <= 0) return null
    const parts: string[] = []
    parts.push(
      i18n.t('scheduleCalendar.logged', {
        value: completedHoursDisplay.formatted,
      })
    )
    parts.push(
      i18n.t('milestonesHitChip', {
        hit: hitState.totalHit,
        total: hitState.total,
      })
    )
    if (hitState.next !== null && nextMilestoneRemainingMinutes !== null) {
      parts.push(
        i18n.t('nextMilestoneLabel', {
          hours: hitState.next,
          remaining: nextMilestoneRemainingDisplay.formatted,
        })
      )
    }
    return parts.join(' · ')
  }

  const noGoalSet = annualGoalHours <= 0

  return (
    <Sheet
      open={visible}
      onOpenChange={(o) => {
        if (!o) handleClose()
      }}
      onClosed={() => {
        if (!openSettings.current) return
        openSettings.current = false
        navigation.navigate('PreferencesPublisher')
      }}
      backgroundColor={theme.colors.backgroundLighter}
    >
      <View
        style={{
          flexShrink: 1,
          paddingHorizontal: 24,
          paddingTop: 24,
          paddingBottom: 24,
          gap: 18,
        }}
      >
        {}
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
              frame
              noTransform
              icon={XIcon}
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
          <Sheet.ScrollView
            contentContainerStyle={{ gap: 18, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
          >
            {}
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
                lineHeight: 20,
              }}
            >
              {i18n.t('milestonesOrderHint')}
            </Text>

            {}
            <View style={{ gap: 8 }}>
              <MilestoneProgressBarPreview
                milestones={milestonesWithGoal}
                minutesCompleted={completedMinutes}
                annualGoalHours={annualGoalHours}
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

            {}
            <View style={{ gap: 10 }}>
              {draft.map((value) => {
                const isHit = hitState.hit.includes(value)
                const isNext = hitState.next === value
                const buffer = inputBuffers[value]
                const displayValue =
                  buffer !== undefined ? buffer : formatPlainNumber(value)

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
                    {}
                    <HitIndicator
                      state={isHit ? 'hit' : isNext ? 'next' : 'future'}
                    />

                    {}
                    <PointerHover effect='lift'>
                      <Pressable
                        onPress={() => handleStep(value, -1)}
                        accessibilityRole='button'
                        accessibilityLabel={i18n.t('decrease')}
                        style={touchTargetFrame(STEPPER_SIZE)}
                      >
                        <View style={stepperStyle}>
                          <LucideIcon
                            icon={MinusIcon}
                            size={theme.fontSize('xs')}
                            style={{ color: theme.colors.textAlt }}
                          />
                        </View>
                      </Pressable>
                    </PointerHover>

                    {}
                    <View
                      style={{
                        minWidth: 56,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <TextInput
                        value={displayValue}
                        inputMode='numeric'
                        textAlign='center'
                        onChangeText={(text) =>
                          setInputBuffers((prev) => ({
                            ...prev,

                            [value]: localizeAppDigits(
                              toAsciiDigits(text).replace(/[^0-9]/g, '')
                            ),
                          }))
                        }
                        onBlur={() => commitInput(value, displayValue)}
                        onSubmitEditing={() => commitInput(value, displayValue)}
                        style={{
                          color: theme.colors.text,
                          fontSize: theme.fontSize('md'),
                          fontFamily: theme.fonts.semiBold,
                          paddingHorizontal: 8,
                          paddingVertical: 6,
                          minWidth: 56,
                          minHeight: 44,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          borderRadius: theme.numbers.borderRadiusSm,
                          backgroundColor: theme.colors.backgroundLighter,
                        }}
                      />
                    </View>

                    <PointerHover effect='lift'>
                      <Pressable
                        onPress={() => handleStep(value, 1)}
                        accessibilityRole='button'
                        accessibilityLabel={i18n.t('increase')}
                        style={touchTargetFrame(STEPPER_SIZE)}
                      >
                        <View style={stepperStyle}>
                          <LucideIcon
                            icon={PlusIcon}
                            size={theme.fontSize('xs')}
                            style={{ color: theme.colors.textAlt }}
                          />
                        </View>
                      </Pressable>
                    </PointerHover>

                    <Text
                      style={{
                        color: theme.colors.textAlt,
                        fontSize: theme.fontSize('sm'),
                      }}
                    >
                      {i18n.t('hours_lowercase')}
                    </Text>

                    {}
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <IconButton
                        noTransform
                        icon={XIcon}
                        size='sm'
                        style={touchTargetFrame(theme.fontSize('sm'))}
                        onPress={() => confirmRemoveMilestone(value)}
                        accessibilityLabel={i18n.t('remove')}
                      />
                    </View>
                  </View>
                )
              })}

              {}
              <PointerHover onHoverChange={setLockedRowHovered}>
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
                    <LucideIcon
                      icon={LockIcon}
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
                    {annualGoalHours}
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
                        letterSpacing: tracking(0.5),
                      }}
                      numberOfLines={1}
                    >
                      {i18n.t('yearGoalSetInSettings')}
                    </Text>
                  </View>
                  <HoverTint
                    visible={lockedRowHovered}
                    borderRadius={theme.numbers.borderRadiusMd}
                  />
                </Pressable>
              </PointerHover>
            </View>

            {}
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
          </Sheet.ScrollView>
        )}
      </View>
    </Sheet>
  )
}

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
        <LucideIcon
          icon={CheckIcon}
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
