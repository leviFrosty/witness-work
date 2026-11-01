import { useEffect, useState } from 'react'
import { View } from 'react-native'
import Sheet from '@/components/ui/Sheet'

import ActionButton from '@/components/ui/ActionButton'
import Text from '@/components/ui/MyText'
import Section from '@/components/ui/inputs/Section'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import type { SelectData } from '@/components/ui/Select'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { monthStatusItems, type MonthStatus } from '@/lib/monthStatus'
import { usePreferences } from '@/stores/preferences'
import { formatDisplay } from '@/lib/dates'

export type MonthStatusScope = 'month' | 'onward'

export interface MonthStatusSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void

  month: number
  year: number
  status: MonthStatus
  onSave: (status: MonthStatus, scope: MonthStatusScope) => void
}

const MonthStatusSheet = ({
  open,
  onOpenChange,
  month,
  year,
  status,
  onSave,
}: MonthStatusSheetProps) => {
  const theme = useTheme()
  const { publisherHours } = usePreferences()
  const [draftStatus, setDraftStatus] = useState<MonthStatus>(status)
  const [scope, setScope] = useState<MonthStatusScope>('month')

  useEffect(() => {
    if (!open) return
    setDraftStatus(status)
    setScope('month')
  }, [open, status])

  const monthLabel = formatDisplay({ year, month }, 'MMMM YYYY')

  const statusItems: SelectData<MonthStatus> = monthStatusItems(publisherHours)
  const scopeItems: SelectData<MonthStatusScope> = [
    {
      label: i18n.t('monthStatus.onlyMonth', { month: monthLabel }),
      value: 'month',
    },
    {
      label: i18n.t('monthStatus.monthOnward', { month: monthLabel }),
      value: 'onward',
    },
  ]

  const handleSave = () => {
    onSave(draftStatus, scope)
    onOpenChange(false)
  }

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
            {i18n.t('monthStatus.title', { month: monthLabel })}
          </Text>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('monthStatus.description')}
          </Text>
        </View>

        <Section>
          <InputRowSelect
            label={i18n.t('status')}
            selectProps={{
              data: statusItems,
              value: draftStatus,
              onChange: ({ value }) => setDraftStatus(value),
            }}
          />
          <InputRowSelect
            label={i18n.t('monthStatus.appliesTo')}
            lastInSection
            selectProps={{
              data: scopeItems,
              value: scope,
              onChange: ({ value }) => setScope(value),
            }}
          />
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

export default MonthStatusSheet
