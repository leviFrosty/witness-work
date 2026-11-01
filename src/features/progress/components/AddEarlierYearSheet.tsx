import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import Sheet from '@/components/ui/Sheet'

import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { formatPlainNumber } from '@/lib/numbers'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import WheelPicker from '@/components/ui/WheelPicker'

interface AddEarlierYearSheetProps {
  open: boolean

  availableEndYears: number[]

  onConfirm: (endYear: number) => void

  onClose: () => void
}

const formatPickerLabel = (endYear: number): string =>
  i18n.t('scheduleCalendar.serviceYearSpan', {
    start: formatPlainNumber(endYear - 1),
    end: formatPlainNumber(endYear),
  })

const AddEarlierYearSheet = ({
  open,
  availableEndYears,
  onConfirm,
  onClose,
}: AddEarlierYearSheetProps) => {
  const theme = useTheme()

  const initialValue = availableEndYears[0]
  const [draftValue, setDraftValue] = useState<number | undefined>(initialValue)
  const draftRef = useRef(draftValue)
  draftRef.current = draftValue

  useEffect(() => {
    if (open) setDraftValue(availableEndYears[0])
  }, [open, availableEndYears])

  const handleConfirm = () => {
    if (draftRef.current !== undefined) onConfirm(draftRef.current)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      backgroundColor={theme.colors.background}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <Text
          accessibilityRole='header'
          style={{ fontSize: 16, fontFamily: theme.fonts.semiBold }}
        >
          {i18n.t('addEarlierYear')}
        </Text>
        <Button noTransform onPress={handleConfirm} hitSlop={8}>
          <Text
            style={{
              color: theme.colors.accent,
              fontSize: 16,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('add')}
          </Text>
        </Button>
      </View>
      {draftValue !== undefined ? (
        <WheelPicker
          data={availableEndYears.map((endYear) => ({
            label: formatPickerLabel(endYear),
            value: endYear,
          }))}
          value={draftValue}
          onValueChange={setDraftValue}
          accessibilityLabel={i18n.t('serviceYear')}
        />
      ) : null}
    </Sheet>
  )
}

export default AddEarlierYearSheet
