import { useEffect, useRef, useState } from 'react'
import { Modal, Pressable, View } from 'react-native'
import { Picker } from '@react-native-picker/picker'
import { Sheet } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import Text from './MyText'

interface AddEarlierYearSheetProps {
  /** Controls visibility. Parent owns this. */
  open: boolean
  /** Selectable service-year endYears, descending (most-recent first). */
  availableEndYears: number[]
  /** Fired when the user taps the primary "Add Year" button. */
  onConfirm: (endYear: number) => void
  /** Fired when the user dismisses without confirming. */
  onClose: () => void
}

const formatPickerLabel = (endYear: number): string =>
  `${endYear - 1}-${endYear}`

const AddEarlierYearSheet = ({
  open,
  availableEndYears,
  onConfirm,
  onClose,
}: AddEarlierYearSheetProps) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    const t = setTimeout(() => setMounted(false), 300)
    return () => clearTimeout(t)
  }, [open])

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
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      animationType='none'
      onRequestClose={onClose}
    >
      <Sheet
        open={open}
        modal={false}
        snapPointsMode='fit'
        onOpenChange={(next: boolean) => {
          if (!next) onClose()
        }}
        animation='quick'
        disableDrag
      >
        <Sheet.Overlay zIndex={100_000 - 1} />
        <Sheet.Frame
          backgroundColor={theme.colors.background}
          padding={0}
          paddingBottom={insets.bottom}
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
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={{ color: theme.colors.accent, fontSize: 16 }}>
                {i18n.t('cancel')}
              </Text>
            </Pressable>
            <Pressable onPress={handleConfirm} hitSlop={8}>
              <Text
                style={{
                  color: theme.colors.accent,
                  fontSize: 16,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('add')}
              </Text>
            </Pressable>
          </View>
          <Picker
            style={{ height: 216 }}
            selectedValue={draftValue}
            onValueChange={(next) => setDraftValue(Number(next))}
            itemStyle={{ color: theme.colors.text }}
          >
            {availableEndYears.map((endYear) => (
              <Picker.Item
                key={endYear}
                label={formatPickerLabel(endYear)}
                value={endYear}
                color={theme.colors.text}
              />
            ))}
          </Picker>
        </Sheet.Frame>
      </Sheet>
    </Modal>
  )
}

export default AddEarlierYearSheet
