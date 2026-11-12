import { View } from 'react-native'
import Button from '@/components/ui/Button'
import { inputLayout, RowSeparator } from '@/components/ui/inputs/InputLayout'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import PickMark from '@/features/territories/components/sharing/PickMark'
import TerritoryPersonAvatar from '@/features/territories/components/sharing/TerritoryPersonAvatar'
import type { TerritoryBuddy } from '@/features/territories/hooks/useTerritorySharing'

export default function PersonPickRow({
  buddy,
  picked,
  single,
  covered,
  sublabel,
  last,
  onPress,
}: {
  buddy: TerritoryBuddy
  picked: boolean

  single?: boolean
  covered?: boolean
  sublabel?: string
  last: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  return (
    <View>
      <Button
        noTransform
        onPress={onPress}
        disabled={covered}
        accessibilityRole={single ? 'radio' : 'checkbox'}
        accessibilityState={{ checked: picked || covered, disabled: covered }}
        accessibilityLabel={[buddy.name, sublabel].filter(Boolean).join(', ')}
        testID={`territory-person-${buddy.name}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: inputLayout.labelGap,
          minHeight: inputLayout.rowMinHeight,
          paddingVertical: 10,
          paddingHorizontal: inputLayout.horizontalPadding,
          opacity: covered ? 0.55 : 1,
        }}
      >
        <TerritoryPersonAvatar
          name={buddy.name}
          avatar={buddy.avatar}
          color={buddy.color}
          size={36}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>{buddy.name}</Text>
          {sublabel && (
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {sublabel}
            </Text>
          )}
        </View>
        <PickMark
          picked={picked || !!covered}
          single={single}
          dimmed={covered}
        />
      </Button>
      {!last && <RowSeparator />}
    </View>
  )
}
