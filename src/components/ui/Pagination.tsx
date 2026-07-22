import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react-native'
import { type StyleProp, View, type ViewStyle } from 'react-native'

import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { buildPaginationModel, PAGINATION_ELLIPSIS } from '@/lib/pagination'

const PAGINATION_HIT_SLOP = { top: 4, bottom: 4, left: 0, right: 0 }

interface Props {
  /** One-based current page. Out-of-range values are clamped for display. */
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  style?: StyleProp<ViewStyle>
}

/**
 * Compact numbered pagination with Previous/Next navigation, active state, and
 * automatic ellipses. It renders nothing when there is only one page.
 */
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
          gap: 2,
        },
        style,
      ]}
    >
      <Button
        noTransform
        hitSlop={PAGINATION_HIT_SLOP}
        disabled={!model.hasPrevious}
        onPress={() => changePage(model.page - 1)}
        accessibilityRole='button'
        accessibilityLabel={i18n.t('pagination.previous')}
        accessibilityState={{ disabled: !model.hasPrevious }}
        style={{
          minHeight: 36,
          paddingHorizontal: 2,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
          opacity: model.hasPrevious ? 1 : 0.8,
        }}
      >
        <LucideIcon
          icon={ChevronLeftIcon}
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
                height: 36,
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
            hitSlop={PAGINATION_HIT_SLOP}
            onPress={() => changePage(item)}
            accessibilityRole='button'
            accessibilityLabel={i18n.t('pagination.page', { page: item })}
            accessibilityState={{ selected: active }}
            style={{
              width: 34,
              height: 36,
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
                fontFamily: active ? theme.fonts.semiBold : theme.fonts.regular,
                fontSize: theme.fontSize('md'),
              }}
            >
              {item}
            </Text>
          </Button>
        )
      })}

      <Button
        noTransform
        hitSlop={PAGINATION_HIT_SLOP}
        disabled={!model.hasNext}
        onPress={() => changePage(model.page + 1)}
        accessibilityRole='button'
        accessibilityLabel={i18n.t('pagination.next')}
        accessibilityState={{ disabled: !model.hasNext }}
        style={{
          minHeight: 36,
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
          icon={ChevronRightIcon}
          size={15}
          color={navColor(model.hasNext)}
        />
      </Button>
    </View>
  )
}

export default Pagination
