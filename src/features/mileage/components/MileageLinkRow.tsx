import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { Users as UsersIcon } from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import { formatNumber } from '@/lib/numbers'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import i18n, { type TranslationKey } from '@/lib/locales'

type Props = {
  label: string
  value?: string
  leftIcon?: AppIcon

  people?: number
  onPress: () => void
  lastInSection?: boolean
}

export default function MileageLinkRow({
  label,
  value,
  leftIcon,
  people,
  onPress,
  lastInSection,
}: Props) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)

  const largeText = useAccessibilityTextSize()
  const shared =
    people === undefined
      ? undefined
      : i18n.t('mileage.sharedCarA11y', {
          people: i18n.t('buddies_carPeople' as TranslationKey, {
            count: people,
          }),
        })
  return (
    <PointerHover onHoverChange={setHovered}>
      <Pressable
        onPress={onPress}
        accessibilityRole='button'
        accessibilityLabel={[label, shared, value].filter(Boolean).join(', ')}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <InputRowContainer
          label={label}
          leftIcon={leftIcon}
          lastInSection={lastInSection}
          controlWidth='auto'
          inlineAtLargeText={!value && people === undefined}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {people !== undefined && (
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <LucideIcon
                  icon={UsersIcon}
                  size={14}
                  color={theme.colors.textAlt}
                />
                <Text style={{ color: theme.colors.textAlt }}>
                  {formatNumber(people)}
                </Text>
              </View>
            )}
            {value ? (
              <Text
                style={
                  largeText
                    ? { color: theme.colors.textAlt, flexShrink: 1 }
                    : { color: theme.colors.textAlt, maxWidth: 180 }
                }
                numberOfLines={largeText ? undefined : 1}
              >
                {value}
              </Text>
            ) : null}
            <LucideIcon
              icon={ChevronForwardIcon}
              size={14}
              color={theme.colors.textAlt}
            />
          </View>
        </InputRowContainer>
        <HoverTint visible={hovered} />
      </Pressable>
    </PointerHover>
  )
}
