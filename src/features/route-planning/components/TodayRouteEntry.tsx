import { View } from 'react-native'
import moment from 'moment'
import { Route as RouteIcon } from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import SupporterBadge from '@/components/SupporterBadge'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useFeatureAccess from '@/hooks/useFeatureAccess'
import i18n, { type TranslationKey } from '@/lib/locales'
import useDayRouteStopCount from '@/features/route-planning/hooks/useDayRouteStopCount'
import useOpenRouteBuilder, {
  type RouteBuilderEntrySurface,
} from '@/hooks/useOpenRouteBuilder'

export default function TodayRouteEntry({
  date,
  surface,
  onNavigate,
}: {
  date: Date
  surface: RouteBuilderEntrySurface

  onNavigate?: (go: () => void) => void
}) {
  const theme = useTheme()
  const { hasAccess } = useFeatureAccess('routePlanning')
  const go = useOpenRouteBuilder(surface)
  const { count, planned } = useDayRouteStopCount(date)
  const isToday = moment(date).isSame(moment(), 'day')
  if (moment(date).isBefore(moment(), 'day')) return null
  const title = isToday
    ? i18n.t('routePlan_entryTitle')
    : i18n.t('routeBuilder_entryTitleDay')
  const subtitle =
    count === 0
      ? i18n.t('routeBuilder_entryEmpty')
      : i18n.t(
          (planned
            ? 'routeBuilder_entryPlanned'
            : 'routePlan_entrySubtitle') as TranslationKey,
          { count }
        )
  const open = () => go(date)

  return (
    <View style={{ paddingTop: 12 }}>
      <Button
        onPress={() => (onNavigate ? onNavigate(open) : open())}
        accessibilityLabel={title}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          borderRadius: theme.numbers.borderRadiusLg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.card,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accentTranslucent,
          }}
        >
          <LucideIcon icon={RouteIcon} size={17} color={theme.colors.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>{title}</Text>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {subtitle}
          </Text>
        </View>
        {hasAccess ? (
          <LucideIcon
            icon={ChevronForwardIcon}
            size={16}
            color={theme.colors.textAlt}
          />
        ) : (
          <SupporterBadge iconOnly />
        )}
      </Button>
    </View>
  )
}
