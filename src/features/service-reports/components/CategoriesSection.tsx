import {
  ChevronRight as ChevronRightIcon,
  X as XIcon,
} from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'
import { Sheet } from 'tamagui'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import Circle from '@/components/ui/Circle'
import IconButton from '@/components/ui/IconButton'
import LucideIcon from '@/components/ui/LucideIcon'
import CategorySegmentBar, {
  CategorySegment,
} from '@/features/service-reports/components/CategorySegmentBar'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'

type Props = {
  segments: CategorySegment[]
  description?: string
  /**
   * `header` is the "Categories ›" section header. `legend` renders the
   * segments as a color key (dot, name, time) that opens the same breakdown —
   * for sitting directly under a bar that already carries those colors.
   */
  trigger?: 'header' | 'legend'
  source: 'month_card' | 'year_card'
}

const CategoriesSection = ({
  segments,
  description = i18n.t('categoryBreakdown_description'),
  trigger = 'header',
  source,
}: Props) => {
  const theme = useTheme()
  const { timeDisplayFormat } = usePreferences()
  const [open, setOpen] = useState(false)
  const visible = segments.filter((s) => s.minutes > 0)
  if (visible.length === 0) return null

  const openBreakdown = () => {
    analytics.capture('category_breakdown_opened', {
      source,
      categories: visible.length,
    })
    setOpen(true)
  }

  return (
    <>
      <Button
        onPress={openBreakdown}
        noTransform
        accessibilityRole='button'
        accessibilityLabel={i18n.t('categoryBreakdown')}
      >
        {trigger === 'legend' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                flexWrap: 'wrap',
                columnGap: 12,
                rowGap: 4,
              }}
            >
              {visible.map((segment, index) => (
                <View
                  key={`${segment.title}-${index}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <Circle color={segment.color} />
                  <Text
                    style={{
                      fontSize: theme.fontSize('xs'),
                      color: theme.colors.textAlt,
                    }}
                  >
                    {`${segment.title} ${
                      formatMinutes(segment.minutes, timeDisplayFormat)
                        .formatted
                    }`}
                  </Text>
                </View>
              ))}
            </View>
            <LucideIcon
              icon={ChevronRightIcon}
              size={12}
              style={{ color: theme.colors.textAlt }}
            />
          </View>
        ) : (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {i18n.t('categories')}
            </Text>
            <IconButton
              icon={ChevronRightIcon}
              size={12}
              iconStyle={{ color: theme.colors.textAlt }}
            />
          </View>
        )}
      </Button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        dismissOnSnapToBottom
        modal
        snapPoints={[70]}
      >
        <Sheet.Handle />
        <Sheet.Overlay zIndex={100_000 - 1} />
        <Sheet.Frame>
          <View
            style={{
              padding: 25,
              gap: 20,
              flex: 1,
            }}
          >
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
                }}
              >
                {i18n.t('categoryBreakdown')}
              </Text>
              <IconButton
                noTransform
                icon={XIcon}
                onPress={() => setOpen(false)}
              />
            </View>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {description}
            </Text>
            <CategorySegmentBar segments={segments} />
          </View>
        </Sheet.Frame>
      </Sheet>
    </>
  )
}

export default CategoriesSection
