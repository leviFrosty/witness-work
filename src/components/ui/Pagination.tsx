import {
  ChevronBackwardIcon,
  ChevronForwardIcon,
} from '@/components/ui/DirectionalIcon'
import { type StyleProp, View, type ViewStyle } from 'react-native'

import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { buildPaginationModel, PAGINATION_ELLIPSIS } from '@/lib/pagination'
import { MIN_TOUCH_TARGET, touchTargetFrame } from '@/components/ui/touchTarget'

const NAV_HEIGHT = 36
const PAGE_WIDTH = 34
const GAP = 2

interface Props {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  style?: StyleProp<ViewStyle>
}

const Pagination = ({ page, pageCount, onPageChange, style }: Props) => {
  const theme = useTheme()
  const model = buildPaginationModel({ page, pageCount })

  if (model.pageCount <= 1) return null

  const changePage = (nextPage: number) => {
    if (nextPage === model.page) return
    onPageChange(nextPage)
  }

  const navColor = (enabled: boolean) =>
    enabled ? theme.colors.text : theme.colors.textAlt

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: GAP,
        },
        style,
      ]}
    >
      <Button
        noTransform
        disabled={!model.hasPrevious}
        onPress={() => changePage(model.page - 1)}
        accessibilityRole='button'
        accessibilityLabel={i18n.t('pagination.previous')}
        accessibilityState={{ disabled: !model.hasPrevious }}
        style={{
          minHeight: MIN_TOUCH_TARGET,
          marginVertical: (NAV_HEIGHT - MIN_TOUCH_TARGET) / 2,
          paddingHorizontal: 2,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
          opacity: model.hasPrevious ? 1 : 0.8,
        }}
      >
        <LucideIcon
          icon={ChevronBackwardIcon}
          size={15}
          color={navColor(model.hasPrevious)}
        />
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={{
            color: navColor(model.hasPrevious),
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('pagination.previous')}
        </Text>
      </Button>

      {model.items.map((item, index) => {
        if (item === PAGINATION_ELLIPSIS) {
          return (
            <View
              key={`${item}-${index}`}
              accessible
              accessibilityLabel={i18n.t('pagination.morePages')}
              style={{
                width: 24,
                height: NAV_HEIGHT,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('lg'),
                }}
              >
                …
              </Text>
            </View>
          )
        }

        const active = item === model.page
        return (
          <Button
            key={item}
            noTransform
            onPress={() => changePage(item)}
            accessibilityRole='button'
            accessibilityLabel={i18n.t('pagination.page', { page: item })}
            accessibilityState={{ selected: active }}
            style={{
              ...touchTargetFrame(PAGE_WIDTH + GAP, NAV_HEIGHT),
              width: PAGE_WIDTH + GAP,
              marginHorizontal: -GAP / 2,
              borderRadius: theme.numbers.borderRadiusMd,
            }}
          >
            <View
              style={{
                width: PAGE_WIDTH,
                height: NAV_HEIGHT,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: active ? theme.colors.border : 'transparent',
                borderRadius: theme.numbers.borderRadiusMd,
                backgroundColor: active
                  ? theme.colors.backgroundLighter
                  : 'transparent',
              }}
            >
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: active
                    ? theme.fonts.semiBold
                    : theme.fonts.regular,
                  fontSize: theme.fontSize('md'),
                }}
              >
                {item}
              </Text>
            </View>
          </Button>
        )
      })}

      <Button
        noTransform
        disabled={!model.hasNext}
        onPress={() => changePage(model.page + 1)}
        accessibilityRole='button'
        accessibilityLabel={i18n.t('pagination.next')}
        accessibilityState={{ disabled: !model.hasNext }}
        style={{
          minHeight: MIN_TOUCH_TARGET,
          marginVertical: (NAV_HEIGHT - MIN_TOUCH_TARGET) / 2,
          paddingHorizontal: 2,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
          opacity: model.hasNext ? 1 : 0.8,
        }}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={{
            color: navColor(model.hasNext),
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('pagination.next')}
        </Text>
        <LucideIcon
          icon={ChevronForwardIcon}
          size={15}
          color={navColor(model.hasNext)}
        />
      </Button>
    </View>
  )
}

export default Pagination
