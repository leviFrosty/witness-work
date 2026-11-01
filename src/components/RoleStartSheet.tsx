import { useEffect, useState } from 'react'
import { View } from 'react-native'
import Sheet from '@/components/ui/Sheet'

import ActionButton from '@/components/ui/ActionButton'
import Text from '@/components/ui/MyText'
import Section from '@/components/ui/inputs/Section'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import type { SelectData } from '@/components/ui/Select'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { monthlyGoalKey, type CalendarMonth } from '@/lib/monthlyGoals'
import type { Publisher } from '@/types/publisher'
import { formatDisplay } from '@/lib/dates'

const ALL_MONTHS = 'all'

export type RoleStartChoice = {
  from: CalendarMonth | null
  resetFutureGoals: boolean
}

export interface RoleStartSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: Publisher

  months: CalendarMonth[]

  hasFutureGoalOverrides: boolean
  onSave: (choice: RoleStartChoice) => void
}

const RoleStartSheet = ({
  open,
  onOpenChange,
  role,
  months,
  hasFutureGoalOverrides,
  onSave,
}: RoleStartSheetProps) => {
  const theme = useTheme()
  const [startKey, setStartKey] = useState<string>(ALL_MONTHS)
  const [resetFutureGoals, setResetFutureGoals] = useState(false)

  useEffect(() => {
    if (!open) return
    setStartKey(months[0] ? monthlyGoalKey(months[0]) : ALL_MONTHS)
    setResetFutureGoals(false)
  }, [open, months])

  const items: SelectData<string> = [
    ...months.map((m, i) => ({
      label:
        i === 0
          ? i18n.t('roleStart.thisMonth', {
              month: formatDisplay(m, 'MMMM YYYY'),
            })
          : formatDisplay(m, 'MMMM YYYY'),
      value: monthlyGoalKey(m),
    })),
    { label: i18n.t('roleStart.allMonths'), value: ALL_MONTHS },
  ]

  const from = months.find((m) => monthlyGoalKey(m) === startKey) ?? null

  const handleSave = () => {
    onSave({ from, resetFutureGoals })
    onOpenChange(false)
  }

  const roleLabel = i18n.t(role)
  const description = from
    ? i18n.t('roleStart.fromDescription', {
        role: roleLabel,
        month: formatDisplay(from, 'MMMM YYYY'),
      })
    : i18n.t('roleStart.allMonthsDescription', { role: roleLabel })

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      backgroundColor={theme.colors.background}
    >
      <View
        style={{
          paddingHorizontal: inputLayout.horizontalPadding,
          width: '100%',
          maxWidth: inputLayout.contentMaxWidth,
          alignSelf: 'center',
          paddingTop: 22,
          paddingBottom: 32,
          gap: 20,
        }}
      >
        <View
          style={{ gap: 6, paddingHorizontal: inputLayout.horizontalPadding }}
        >
          <Text
            accessibilityRole='header'
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('xl'),
            }}
          >
            {i18n.t('roleStart.title', { role: roleLabel })}
          </Text>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {description}
          </Text>
        </View>

        <Section>
          {months.length > 0 && (
            <InputRowSelect
              label={i18n.t('roleStart.startingMonth')}
              lastInSection={!hasFutureGoalOverrides}
              selectProps={{
                data: items,
                value: startKey,
                onChange: ({ value }) => setStartKey(value),
              }}
            />
          )}
          {hasFutureGoalOverrides && (
            <InputRowSwitch
              label={i18n.t('monthGoalEditor.resetFutureGoals')}
              info={i18n.t('monthGoalEditor.roleChangeDescription')}
              value={resetFutureGoals}
              onValueChange={setResetFutureGoals}
              lastInSection
            />
          )}
        </Section>

        <ActionButton
          noTransform
          accessibilityRole='button'
          onPress={handleSave}
        >
          {i18n.t('save')}
        </ActionButton>
      </View>
    </Sheet>
  )
}

export default RoleStartSheet
