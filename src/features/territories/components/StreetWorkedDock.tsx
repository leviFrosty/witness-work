import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CircleCheck as CircleCheckIcon } from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export default function StreetWorkedDock({
  title,
  next,
  onNext,
  onMarkNotWorked,
  onLayout,
}: {
  title: string
  next: string
  onNext: () => void
  onMarkNotWorked: () => void
  onLayout: (height: number) => void
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View
      testID='street-worked-dock'
      onLayout={(event) => onLayout(event.nativeEvent.layout.height)}
      style={{
        backgroundColor: theme.colors.card,
        borderTopStartRadius: inputLayout.sectionRadius,
        borderTopEndRadius: inputLayout.sectionRadius,
        borderCurve: 'continuous',
        borderTopWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <ContentColumn
        style={{
          paddingTop: 10,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 14,
          gap: 10,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 44,
            gap: 8,
          }}
        >
          <LucideIcon
            icon={CircleCheckIcon}
            size={20}
            color={theme.colors.accent}
          />
          <Text
            testID='street-worked-title'
            style={{ flex: 1, fontFamily: theme.fonts.semiBold }}
          >
            {title}
          </Text>
          <Button
            onPress={onMarkNotWorked}
            testID='street-worked-undo'
            style={{
              minHeight: 44,
              paddingHorizontal: 8,
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                textDecorationLine: 'underline',
              }}
            >
              {i18n.t('territories.markNotWorked')}
            </Text>
          </Button>
        </View>
        <ActionButton
          onPress={onNext}
          submitShortcut={false}
          testID='street-next'
        >
          {next}
        </ActionButton>
      </ContentColumn>
    </View>
  )
}
