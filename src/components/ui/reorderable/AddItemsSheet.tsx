import { Check as CheckIcon, Plus as PlusIcon } from 'lucide-react-native'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Sheet from '@/components/ui/Sheet'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import { tracking } from '@/lib/tracking'

export type AddableItem<Id extends string> = {
  id: Id
  icon: AppIcon
  title: string

  description: string

  added: boolean
}

type Props<Id extends string> = {
  open: boolean
  onClose: () => void
  title: string

  groups: { key: string; title?: string; items: AddableItem<Id>[] }[]
  onAdd: (id: Id) => void

  addedHint: string
  testID?: string
}

export default function AddItemsSheet<Id extends string>({
  open,
  onClose,
  title,
  groups,
  onAdd,
  addedHint,
  testID,
}: Props<Id>) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      backgroundColor={theme.colors.background}
      testID={testID}
    >
      <Sheet.ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: insets.bottom + 24,
          gap: 18,
        }}
      >
        <Text
          accessibilityRole='header'
          style={{
            fontSize: theme.fontSize('xl'),
            fontFamily: theme.fonts.bold,
          }}
        >
          {title}
        </Text>
        {groups.map((group) => {
          if (!group.items.length) return null
          return (
            <View key={group.key} style={{ gap: 8 }}>
              {group.title ? (
                <Text
                  style={{
                    marginStart: 4,
                    fontFamily: theme.fonts.semiBold,
                    fontSize: theme.fontSize('xs'),
                    color: theme.colors.textAlt,
                    textTransform: 'uppercase',
                    letterSpacing: tracking(0.5),
                  }}
                >
                  {group.title}
                </Text>
              ) : null}
              <View
                style={{
                  borderRadius: theme.numbers.borderRadiusLg,
                  backgroundColor: theme.colors.card,
                  overflow: 'hidden',
                }}
              >
                {group.items.map((item, index) => {
                  const isAdded = item.added
                  return (
                    <Button
                      key={item.id}
                      disabled={isAdded}
                      onPress={() => {
                        Haptics.light()
                        onAdd(item.id)

                        onClose()
                      }}
                      accessibilityLabel={`${item.title}. ${item.description}`}
                      accessibilityHint={isAdded ? addedHint : undefined}
                      accessibilityState={{ disabled: isAdded }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderTopColor: theme.colors.border,
                      }}
                      noTransform
                    >
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: theme.colors.accentTranslucent,
                        }}
                      >
                        <LucideIcon
                          icon={item.icon}
                          size={17}
                          color={theme.colors.accent}
                        />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontFamily: theme.fonts.semiBold }}>
                          {item.title}
                        </Text>
                        <Text
                          style={{
                            fontSize: theme.fontSize('xs'),
                            color: theme.colors.textAlt,
                          }}
                        >
                          {item.description}
                        </Text>
                      </View>
                      <View
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 13,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isAdded
                            ? 'transparent'
                            : theme.colors.accent,
                        }}
                      >
                        <LucideIcon
                          icon={isAdded ? CheckIcon : PlusIcon}
                          size={15}
                          strokeWidth={3}
                          color={
                            isAdded
                              ? theme.colors.accent
                              : theme.colors.textInverse
                          }
                        />
                      </View>
                    </Button>
                  )
                })}
              </View>
            </View>
          )
        })}
      </Sheet.ScrollView>
    </Sheet>
  )
}
