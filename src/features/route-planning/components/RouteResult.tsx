import { Fragment } from 'react'
import { View } from 'react-native'
import {
  LocateFixed as LocateFixedIcon,
  Navigation as NavigationIcon,
} from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Divider from '@/components/ui/Divider'
import IconButton from '@/components/ui/IconButton'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PointerTooltip from '@/components/ui/PointerTooltip'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import RouteSectionLabel from '@/features/route-planning/components/RouteSectionLabel'
import RouteStopRow from '@/features/route-planning/components/RouteStopRow'
import type { PlannedRoute } from '@/features/route-planning/hooks/useRoutePlanner'
import type { NavigationApp } from '@/features/route-planning/lib/routeHandoff'
import { formatRouteSummary } from '@/features/route-planning/lib/routeSummary'

const appName = (app: NavigationApp) =>
  i18n.t(
    app === 'apple' ? 'appleMaps' : app === 'google' ? 'googleMaps' : 'waze'
  )

/** The stops in their new order, and the way into the navigation app. */
export default function RouteResult({
  route,
  lastOpened,
  onOpen,
  onEditStops,
}: {
  route: PlannedRoute
  lastOpened: number | null
  onOpen: (index: number) => void
  onEditStops: () => void
}) {
  const theme = useTheme()
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const distanceUnit = usePreferences((s) => s.distanceUnit)
  const { handoff, stops } = route
  const stopByStop = handoff.mode === 'stopByStop'
  const next = Math.min((lastOpened ?? -1) + 1, stops.length - 1)
  const nextStop = stops[next]
  const info = [
    route.summary && i18n.t('routePlan_summaryCaption'),
    stopByStop && i18n.t('routePlan_oneAtATime', { app: appName(handoff.app) }),
  ].filter(Boolean)

  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 4 }}>
        <XView>
          <RouteSectionLabel>{i18n.t('routePlan_yourRoute')}</RouteSectionLabel>
          {info.length > 0 && (
            <InfoPopover
              inline
              title={i18n.t('routePlan_yourRoute')}
              description={info.join('\n\n')}
            />
          )}
        </XView>
        {route.summary && (
          <Text
            style={{
              fontSize: theme.fontSize('xl'),
              fontFamily: theme.fonts.bold,
            }}
          >
            {formatRouteSummary(route.summary, {
              timeDisplayFormat,
              distanceUnit,
            })}
          </Text>
        )}
      </View>

      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {route.startsAtCurrentLocation && (
          <XView style={{ gap: 12, paddingVertical: 10 }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.accentTranslucent,
              }}
            >
              <LucideIcon
                icon={LocateFixedIcon}
                size={15}
                color={theme.colors.accent}
              />
            </View>
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              {i18n.t('routePlan_currentLocation')}
            </Text>
          </XView>
        )}
        {stops.map((stop, index) => (
          <Fragment key={stop.key}>
            {(index > 0 || route.startsAtCurrentLocation) && <Divider />}
            <RouteStopRow
              stop={stop}
              position={index + 1}
              badge={
                index === 0 && !route.startsAtCurrentLocation
                  ? i18n.t('routePlan_startBadge')
                  : undefined
              }
              dimmed={stopByStop && lastOpened !== null && index < next}
              trailing={
                stopByStop ? (
                  <PointerTooltip label={i18n.t('routePlan_navigate')}>
                    <IconButton
                      icon={NavigationIcon}
                      size={18}
                      color={theme.colors.accent}
                      accessibilityLabel={i18n.t('routePlan_navigateToNamed', {
                        name: stop.title,
                      })}
                      onPress={() => onOpen(index)}
                    />
                  </PointerTooltip>
                ) : undefined
              }
            />
          </Fragment>
        ))}
      </Card>

      {stopByStop && nextStop ? (
        <ActionButton onPress={() => onOpen(next)}>
          {i18n.t('routePlan_navigateToStop', {
            position: next + 1,
            name: nextStop.title,
          })}
        </ActionButton>
      ) : (
        <ActionButton onPress={() => onOpen(0)}>
          {i18n.t('routePlan_openIn', { app: appName(handoff.app) })}
        </ActionButton>
      )}

      <Button
        variant='outline'
        onPress={onEditStops}
        style={{
          paddingVertical: 12,
          alignItems: 'center',
          borderRadius: theme.numbers.borderRadiusSm,
        }}
      >
        <Text style={{ fontFamily: theme.fonts.semiBold }}>
          {i18n.t('routePlan_editStops')}
        </Text>
      </Button>
    </View>
  )
}
