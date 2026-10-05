import { useState } from 'react'
import { Pressable, View } from 'react-native'
import {
  Column,
  DropdownMenu,
  DropdownMenuItem,
  Host,
  Icon,
  RNHostView,
  Text,
} from '@expo/ui/jetpack-compose'
import { selectable, selectableGroup } from '@expo/ui/jetpack-compose/modifiers'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import type { SelectMenuProps } from '@/components/ui/SelectMenu'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import checkIcon from '@/assets/icons/check.xml'

export default function SelectMenu({
  items,
  onSelect,
  accessibilityLabel,
  accessibilityValue,
  hoverRadius,
  children,
}: SelectMenuProps) {
  const theme = useTheme()
  const colorScheme = usePreferences((s) => s.colorScheme)
  const [expanded, setExpanded] = useState(false)
  const [hovered, setHovered] = useState(false)
  // Carry the form's control width into the hosted React Native content.
  const [width, setWidth] = useState<number>()

  const select = (id: string) => {
    setExpanded(false)
    onSelect(id)
  }

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <Host matchContents colorScheme={colorScheme}>
        <DropdownMenu
          expanded={expanded}
          onDismissRequest={() => setExpanded(false)}
          color={theme.colors.card}
        >
          <DropdownMenu.Trigger>
            <RNHostView matchContents>
              <PointerHover onHoverChange={setHovered}>
                <Pressable
                  onPress={() => setExpanded(true)}
                  accessibilityRole='button'
                  accessibilityLabel={accessibilityLabel}
                  accessibilityState={{ expanded }}
                  accessibilityValue={{ text: accessibilityValue }}
                  style={{ width }}
                >
                  {children}
                  <HoverTint visible={hovered} borderRadius={hoverRadius} />
                </Pressable>
              </PointerHover>
            </RNHostView>
          </DropdownMenu.Trigger>
          <DropdownMenu.Items>
            <Column modifiers={[selectableGroup()]}>
              {items.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  elementColors={{ textColor: theme.colors.text }}
                  modifiers={[
                    selectable(
                      item.selected,
                      () => select(item.id),
                      'radioButton'
                    ),
                  ]}
                  onClick={() => select(item.id)}
                >
                  <DropdownMenuItem.Text>
                    <Text>{item.label}</Text>
                  </DropdownMenuItem.Text>
                  {item.selected ? (
                    <DropdownMenuItem.TrailingIcon>
                      <Icon
                        source={checkIcon}
                        size={20}
                        tint={theme.colors.text}
                      />
                    </DropdownMenuItem.TrailingIcon>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </Column>
          </DropdownMenu.Items>
        </DropdownMenu>
      </Host>
    </View>
  )
}
