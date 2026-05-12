import { useCallback, useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { Sheet } from 'tamagui'

import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import useTheme from '@/contexts/theme'
import { faTimes } from '@fortawesome/free-solid-svg-icons'

import i18n, { TranslationKey } from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * When true, both Save and Skip flip `hasSeenAvailabilityOnboarding` to true
   * so the just-in-time trigger only ever fires once. Settings re-opens the
   * sheet with `markSeenOnDismiss={false}` so revisiting from Settings doesn't
   * affect the gate.
   */
  markSeenOnDismiss?: boolean
}

const WEEKDAY_KEYS: ReadonlyArray<{
  index: number
  i18nKey: TranslationKey
}> = [
  { index: 0, i18nKey: 'availability.weekday.sun' },
  { index: 1, i18nKey: 'availability.weekday.mon' },
  { index: 2, i18nKey: 'availability.weekday.tue' },
  { index: 3, i18nKey: 'availability.weekday.wed' },
  { index: 4, i18nKey: 'availability.weekday.thu' },
  { index: 5, i18nKey: 'availability.weekday.fri' },
  { index: 6, i18nKey: 'availability.weekday.sat' },
]

const AvailabilityOnboardingSheet = ({
  open,
  onOpenChange,
  markSeenOnDismiss = true,
}: Props) => {
  const theme = useTheme()
  const {
    excludedWeekdays,
    setExcludedWeekdays,
    setHasSeenAvailabilityOnboarding,
  } = usePreferences()

  const [selected, setSelected] = useState<number[]>(excludedWeekdays)

  useEffect(() => {
    if (open) setSelected(excludedWeekdays)
  }, [open, excludedWeekdays])

  const toggle = useCallback((index: number) => {
    setSelected((prev) =>
      prev.includes(index) ? prev.filter((d) => d !== index) : [...prev, index]
    )
  }, [])

  const handleSave = useCallback(() => {
    setExcludedWeekdays(selected.slice().sort((a, b) => a - b))
    if (markSeenOnDismiss) setHasSeenAvailabilityOnboarding(true)
    onOpenChange(false)
  }, [
    selected,
    setExcludedWeekdays,
    markSeenOnDismiss,
    setHasSeenAvailabilityOnboarding,
    onOpenChange,
  ])

  const handleSkip = useCallback(() => {
    if (markSeenOnDismiss) setHasSeenAvailabilityOnboarding(true)
    onOpenChange(false)
  }, [markSeenOnDismiss, setHasSeenAvailabilityOnboarding, onOpenChange])

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      dismissOnSnapToBottom
      modal
      snapPoints={[55]}
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        <View style={{ padding: 20, gap: 16, flex: 1 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontSize: theme.fontSize('xl'),
                fontFamily: theme.fonts.semiBold,
                flexShrink: 1,
                paddingRight: 12,
              }}
            >
              {i18n.t('availability.onboarding.title')}
            </Text>
            <IconButton noTransform icon={faTimes} onPress={handleSkip} />
          </View>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
              lineHeight: theme.fontSize('sm') * 1.4,
            }}
          >
            {i18n.t('availability.onboarding.body')}
          </Text>

          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
              paddingVertical: 4,
            }}
          >
            {WEEKDAY_KEYS.map(({ index, i18nKey }) => {
              const isSelected = selected.includes(index)
              return (
                <Pressable
                  key={index}
                  onPress={() => toggle(index)}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: theme.numbers.borderRadiusSm,
                    borderWidth: 1,
                    borderColor: isSelected
                      ? theme.colors.accent
                      : theme.colors.border,
                    backgroundColor: isSelected
                      ? theme.colors.accentTranslucent
                      : 'transparent',
                  }}
                  accessibilityRole='button'
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text
                    style={{
                      fontFamily: theme.fonts.semiBold,
                      color: isSelected
                        ? theme.colors.accent
                        : theme.colors.text,
                      fontSize: theme.fontSize('sm'),
                    }}
                  >
                    {i18n.t(i18nKey)}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 'auto' }}>
            <Button
              onPress={handleSkip}
              style={{
                flex: 1,
                alignItems: 'center',
                borderColor: theme.colors.border,
                borderWidth: 1,
                paddingVertical: 12,
                borderRadius: theme.numbers.borderRadiusSm,
              }}
              noTransform
            >
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('availability.onboarding.skip')}
              </Text>
            </Button>
            <Button
              onPress={handleSave}
              style={{
                flex: 1,
                alignItems: 'center',
                backgroundColor: theme.colors.accent,
                paddingVertical: 12,
                borderRadius: theme.numbers.borderRadiusSm,
              }}
            >
              <Text
                style={{
                  color: theme.colors.textInverse,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('availability.onboarding.save')}
              </Text>
            </Button>
          </View>
        </View>
      </Sheet.Frame>
    </Sheet>
  )
}

export default AvailabilityOnboardingSheet
