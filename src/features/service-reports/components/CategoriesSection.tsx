import { X as XIcon } from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import { useState } from 'react'
import { View } from 'react-native'
import Sheet from '@/components/ui/Sheet'
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

import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import { tracking } from '@/lib/tracking'

type Props = {
  segments: CategorySegment[]
  description?: string

  trigger?: 'header' | 'legend'
}

const CategoriesSection = ({
  segments,
  description = i18n.t('categoryBreakdown_description'),
  trigger = 'header',
}: Props) => {
  const theme = useTheme()
  const { timeDisplayFormat } = usePreferences()
  const [open, setOpen] = useState(false)
  const visible = segments.filter((s) => s.minutes > 0)
  if (visible.length === 0) return null

  const openBreakdown = () => {
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
              icon={ChevronForwardIcon}
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
                letterSpacing: tracking(0.5),
              }}
            >
              {i18n.t('categories')}
            </Text>
            <IconButton
              icon={ChevronForwardIcon}
              size={12}
              iconStyle={{ color: theme.colors.textAlt }}
            />
          </View>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <Sheet.ScrollView contentContainerStyle={{ padding: 25, gap: 20 }}>
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
        </Sheet.ScrollView>
      </Sheet>
    </>
  )
}

export default CategoriesSection
