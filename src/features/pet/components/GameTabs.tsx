import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import {
  cssColor,
  gameTabIcon,
  type GamePalette,
} from '@/features/pet/art/gameUi'
import {
  GameFrame,
  GamePixelImage,
  gamePixelScale,
} from '@/features/pet/components/GamePixels'
import { roomTabLabel } from '@/features/pet/lib/roomLabels'
import type { RoomTab } from '@/features/pet/lib/roomOptions'
import { tabGap } from '@/features/pet/lib/shop'

/** A tab's size in Shop pixels. */
const TAB_W = 27
const TAB_H = 26
const MIN_GAP = 2

/** The red dot on a tab with something new in it, in pixels. */
const DOT = 4

/**
 * The room's categories, in the Shop and the pet's details: an icon and a name
 * each, the open one a cloth tab in the accent, and a red dot on one with
 * something new. Where they don't all fit, the row scrolls and runs off the
 * edge.
 */
export default function GameTabs<Tab extends RoomTab>({
  palette,
  tabs,
  tab,
  onChange,
  inset,
  dots,
}: {
  palette: GamePalette
  tabs: readonly Tab[]
  tab: Tab
  onChange: (tab: Tab) => void
  /** The screen's side padding: the row bleeds through it. */
  inset: number
  /** The tabs holding something new. */
  dots?: ReadonlySet<RoomTab>
}) {
  const theme = useTheme()
  const scale = gamePixelScale()
  const [width, setWidth] = useState(0)
  const tabW = TAB_W * scale
  const gap = tabGap(width - inset, tabW, MIN_GAP * scale, tabs.length)
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{
        marginHorizontal: -inset,
        borderTopWidth: 1,
        borderColor: cssColor(palette.line),
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole='tablist'
        accessibilityLabel={i18n.t('pet.shop.categories')}
        contentContainerStyle={{ paddingHorizontal: inset, gap }}
      >
        {tabs.map((id) => {
          const on = id === tab
          const ink = on ? palette.onAccent : palette.inkAlt
          const label = roomTabLabel(id)
          const dot = dots?.has(id) ?? false
          const content = (
            <>
              <View>
                <GamePixelImage
                  cacheKey={`tab|${id}|${ink}`}
                  make={() => gameTabIcon(id, ink)}
                />
                {dot && (
                  <View
                    style={{
                      position: 'absolute',
                      top: -scale,
                      end: -2 * scale,
                      width: DOT * scale,
                      height: DOT * scale,
                      backgroundColor: cssColor(palette.newFill),
                    }}
                  />
                )}
              </View>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 11,
                  fontFamily: on ? theme.fonts.bold : theme.fonts.semiBold,
                  color: ink,
                }}
              >
                {label}
              </Text>
            </>
          )
          return (
            <Button
              key={id}
              onPress={() => onChange(id)}
              accessibilityRole='tab'
              accessibilityState={{ selected: on }}
              accessibilityLabel={
                dot
                  ? i18n.t('pet.room.secret.newA11y', { option: label })
                  : label
              }
              style={{ width: tabW, height: TAB_H * scale }}
            >
              {on ? (
                <GameFrame
                  kind='tab'
                  palette={palette}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingTop: 4 * scale,
                    gap: 2,
                  }}
                >
                  {content}
                </GameFrame>
              ) : (
                <View
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingTop: 4 * scale,
                    gap: 2,
                  }}
                >
                  {content}
                </View>
              )}
            </Button>
          )
        })}
      </ScrollView>
    </View>
  )
}
