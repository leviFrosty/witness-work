import { CircleCheck as CircleCheckIcon } from 'lucide-react-native'
import { Pressable, TextInput as RNTextInput, View } from 'react-native'
import i18n from '@/lib/locales'
import { PREFERENCE_DEFAULTS, usePreferences } from '@/stores/preferences'
import { publisherChoices } from '@/constants/publisher'
import Select, { SelectData } from '@/components/ui/Select'
import { Publisher } from '@/types/publisher'
import { useRef, useState } from 'react'
import useGoalHoursInput from '@/hooks/useGoalHoursInput'
import { monthlyGoalKey, type CalendarMonth } from '@/lib/monthlyGoals'
import { addCalendarMonths, calendarMonthOf } from '@/lib/roleHistory'
import { analytics } from '@/lib/analytics'
import useServiceReport from '@/stores/serviceReport'
import type { TimeEntriesByYear } from '@/types/timeEntry'
import RoleStartSheet, {
  type RoleStartChoice,
} from '@/components/RoleStartSheet'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import { useCardStyle } from '@/components/ui/Card'
import LucideIcon from '@/components/ui/LucideIcon'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

const MAX_START_MONTHS = 36

const earliestLoggedMonth = (
  serviceReports: TimeEntriesByYear
): CalendarMonth | null => {
  let earliest: CalendarMonth | null = null
  for (const year of Object.keys(serviceReports)) {
    for (const month of Object.keys(serviceReports[year] ?? {})) {
      if (!serviceReports[year][month]?.length) continue
      const m = { year: Number(year), month: Number(month) }
      if (!earliest || monthlyGoalKey(m) < monthlyGoalKey(earliest)) {
        earliest = m
      }
    }
  }
  return earliest
}

const PublisherTypeSelector = ({
  showGoalDescription = true,
  askStartMonth = false,
  variant = 'select',
}: {
  showGoalDescription?: boolean

  variant?: 'select' | 'list'

  askStartMonth?: boolean
}) => {
  const items: SelectData<Publisher> = publisherChoices.map((value) => ({
    label: i18n.t(value),
    value,
  }))

  const theme = useTheme()
  const cardStyle = useCardStyle()
  const { publisherHours, role, monthlyGoalOverrides, setRole, set } =
    usePreferences()
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const customHours = useGoalHoursInput({
    hours: publisherHours.custom,
    defaultHours: PREFERENCE_DEFAULTS.publisherHours.custom,
    onSave: (custom) =>
      set((s) => ({ publisherHours: { ...s.publisherHours, custom } })),
  })
  const customHoursInput = useRef<RNTextInput>(null)
  const [pendingRole, setPendingRole] = useState<Publisher | null>(null)
  const [hoveredRole, setHoveredRole] = useState<Publisher | null>(null)

  const thisMonth = calendarMonthOf()
  const currentMonthKey = monthlyGoalKey(thisMonth)
  const hasFutureGoalOverrides = Object.keys(monthlyGoalOverrides).some(
    (key) => key >= currentMonthKey
  )

  const earliest = earliestLoggedMonth(serviceReports)
  const startMonths: CalendarMonth[] = []
  for (let i = 0; i < MAX_START_MONTHS; i++) {
    const m = addCalendarMonths(thisMonth, -i)
    if (i > 0 && (!earliest || monthlyGoalKey(m) < monthlyGoalKey(earliest))) {
      break
    }
    startMonths.push(m)
  }
  const hasEarlierMonths = startMonths.length > 1

  const resetFutureGoalOverrides = () => {
    const pastOverrides = Object.fromEntries(
      Object.entries(monthlyGoalOverrides).filter(
        ([key]) => key < currentMonthKey
      )
    )
    set({ monthlyGoalOverrides: pastOverrides })
  }

  const handleRoleChange = (nextRole: Publisher) => {
    if (nextRole === role) return

    if (!askStartMonth || (!hasEarlierMonths && !hasFutureGoalOverrides)) {
      if (askStartMonth) {
        analytics.capture('role_period_set', {
          source: 'settings',
          role: nextRole,
          scope: 'all_months',
        })
      }
      setRole(nextRole)
      return
    }

    setPendingRole(nextRole)
  }

  const handleStartChoice = ({ from, resetFutureGoals }: RoleStartChoice) => {
    if (!pendingRole) return
    if (resetFutureGoals) resetFutureGoalOverrides()
    setRole(pendingRole, from ? { from } : undefined)
    analytics.capture('role_period_set', {
      source: 'settings',
      role: pendingRole,
      scope: from ? 'from_month' : 'all_months',
      months_back: from
        ? (thisMonth.year - from.year) * 12 + thisMonth.month - from.month
        : undefined,
      reset_future_goals: resetFutureGoals,
    })
  }

  const requirement =
    role === 'publisher'
      ? i18n.t('noHourRequirement')
      : i18n.t('hourMonthlyRequirement', {
          count: publisherHours[role],
        })
  const select = (
    <Select
      accessibilityLabel={i18n.t('status')}
      data={items}
      onChange={({ value }) => handleRoleChange(value)}
      value={role}
    />
  )

  const list = (
    <View
      accessibilityRole='radiogroup'
      accessibilityLabel={i18n.t('status')}
      style={{ ...cardStyle, overflow: 'hidden' }}
    >
      {items.map(({ label, value }, index) => {
        const selected = value === role
        return (
          <PointerHover
            key={value}
            onHoverChange={(hovered) =>
              setHoveredRole((current) =>
                hovered ? value : current === value ? null : current
              )
            }
          >
            <Pressable
              accessibilityRole='radio'
              accessibilityState={{ selected }}
              onPress={() => handleRoleChange(value)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                minHeight: 52,
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderTopWidth: index === 0 ? 0 : 1,
                borderColor: theme.colors.border,
                backgroundColor: selected
                  ? theme.colors.accentTranslucent
                  : undefined,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{
                  flex: 1,
                  fontSize: theme.fontSize('md'),
                  fontFamily: selected
                    ? theme.fonts.semiBold
                    : theme.fonts.medium,
                }}
              >
                {label}
              </Text>
              {value !== 'custom' && (
                <Text
                  style={{
                    fontSize: theme.fontSize('sm'),
                    color: theme.colors.textAlt,
                  }}
                >
                  {value === 'publisher'
                    ? i18n.t('noHourRequirement')
                    : i18n.t('yourPlanMonthlyGoal', {
                        hours: publisherHours[value],
                      })}
                </Text>
              )}
              <View
                style={{
                  width: 22,
                  height: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {selected ? (
                  <LucideIcon
                    icon={CircleCheckIcon}
                    size={22}
                    color={theme.colors.accent}
                  />
                ) : (
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: theme.colors.border,
                    }}
                  />
                )}
              </View>
              <HoverTint visible={hoveredRole === value} />
            </Pressable>
          </PointerHover>
        )
      })}
    </View>
  )

  return (
    <View>
      {variant === 'list' ? (
        list
      ) : (
        <InputRowContainer
          label={i18n.t('status')}
          info={
            showGoalDescription && role !== 'publisher'
              ? i18n.t('defaultMonthlyGoal_description')
              : undefined
          }
          description={requirement}
        >
          {select}
        </InputRowContainer>
      )}

      {askStartMonth && (
        <RoleStartSheet
          open={pendingRole !== null}
          onOpenChange={(open) => {
            if (!open) setPendingRole(null)
          }}
          role={pendingRole ?? role}
          months={hasEarlierMonths ? startMonths : []}
          hasFutureGoalOverrides={hasFutureGoalOverrides}
          onSave={handleStartChoice}
        />
      )}

      {role === 'custom' && (
        <TextInputRow
          ref={customHoursInput}
          label={i18n.t('customHourRequirement')}
          info={i18n.t('defaultMonthlyGoal_description')}
          controlStyle={{ width: 96 }}
          textInputProps={{
            accessibilityLabel: i18n.t('customHourRequirement'),
            maxLength: 5,
            ...customHours,
            returnKeyType: 'done',
            inputMode: 'decimal',
            textAlign: 'start',
          }}
        />
      )}
    </View>
  )
}
export default PublisherTypeSelector
