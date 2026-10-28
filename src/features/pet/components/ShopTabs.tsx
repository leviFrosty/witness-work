import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import {
  cssColor,
  shopTabIcon,
  type ShopPalette,
} from '@/features/pet/art/shop'
import {
  ShopFrame,
  ShopPixelImage,
  shopPixelScale,
} from '@/features/pet/components/ShopPixels'
import { roomTabLabel } from '@/features/pet/lib/roomLabels'
import { SHOP_TABS, tabGap, type ShopTab } from '@/features/pet/lib/shop'

/** A tab's size in Shop pixels. */
const TAB_W = 27
const TAB_H = 26
const MIN_GAP = 2

/**
 * The Shop's categories: an icon and a name each, the open one a cloth tab in
 * the accent. Where they don't all fit, the row scrolls and runs off the edge.
 */
export default function ShopTabs({
  palette,
  tab,
  onChange,
  inset,
}: {
  palette: ShopPalette
  tab: ShopTab
  onChange: (tab: ShopTab) => void
  /** The screen's side padding: the row bleeds through it. */
  inset: number
}) {
  const theme = useTheme()
  const scale = shopPixelScale()
  const [width, setWidth] = useState(0)
  const tabW = TAB_W * scale
  const gap = tabGap(width - inset, tabW, MIN_GAP * scale)
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
        {SHOP_TABS.map((id) => {
          const on = id === tab
          const ink = on ? palette.onAccent : palette.inkAlt
          const label = roomTabLabel(id)
          const content = (
            <>
              <ShopPixelImage
                cacheKey={`tab|${id}|${ink}`}
                make={() => shopTabIcon(id, ink)}
              />
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
              accessibilityLabel={label}
              style={{ width: tabW, height: TAB_H * scale }}
            >
              {on ? (
                <ShopFrame
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
                </ShopFrame>
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
