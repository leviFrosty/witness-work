import { Fragment } from 'react'
import { View } from 'react-native'
import {
  CircleMinus as CircleMinusIcon,
  CirclePlus as CirclePlusIcon,
} from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import Card from '@/components/ui/Card'
import Divider from '@/components/ui/Divider'
import IconButton from '@/components/ui/IconButton'
import InfoPopover from '@/components/ui/InfoPopover'
import Loader from '@/components/ui/Loader'
import Text from '@/components/ui/MyText'
import PointerTooltip from '@/components/ui/PointerTooltip'
import Select from '@/components/ui/Select'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import RouteSectionLabel from '@/features/route-planning/components/RouteSectionLabel'
import RouteStopRow from '@/features/route-planning/components/RouteStopRow'
import { routePlanErrorMessage } from '@/features/route-planning/lib/routePlanErrors'
import type { RoutePlannerError } from '@/features/route-planning/hooks/useRoutePlanner'
import { MAX_ROUTE_STOPS } from '@/features/route-planning/lib/routeLimits'
import type { RouteStop } from '@/features/route-planning/lib/routeStops'

const CURRENT_LOCATION = 'currentLocation'

/** Pick the start, trim the stops, then ask for the shortest order. */
export default function RouteReview({
  included,
  removed,
  startStop,
  canRestore,
  missingLocationCount,
  planning,
  error,
  onRemove,
  onRestore,
  onChooseStart,
  onPlan,
}: {
  included: RouteStop[]
  removed: RouteStop[]
  startStop: RouteStop | null
  canRestore: boolean
  missingLocationCount: number
  planning: boolean
  error: RoutePlannerError | null
  onRemove: (key: string) => void
  onRestore: (key: string) => void
  onChooseStart: (key: string | null) => void
  onPlan: () => void
}) {
  const theme = useTheme()
  const footnote = {
    color: theme.colors.textAlt,
    fontSize: theme.fontSize('sm'),
  }

  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 8 }}>
        <RouteSectionLabel>{i18n.t('routePlan_startFrom')}</RouteSectionLabel>
        <Select
          accessibilityLabel={i18n.t('routePlan_startFrom')}
          data={[
            {
              label: i18n.t('routePlan_currentLocation'),
              value: CURRENT_LOCATION,
            },
            ...included.map((stop) => ({ label: stop.title, value: stop.key })),
          ]}
          value={startStop?.key ?? CURRENT_LOCATION}
          onChange={({ value }) =>
            onChooseStart(value === CURRENT_LOCATION ? null : value)
          }
        />
      </View>

      <View style={{ gap: 8 }}>
        <XView>
          <RouteSectionLabel>
            {i18n.t('routePlan_stopsCount' as TranslationKey, {
              count: included.length,
            })}
          </RouteSectionLabel>
          <InfoPopover
            inline
            title={i18n.t('routePlan_stopsInfoTitle')}
            description={i18n.t('routePlan_stopsInfo', {
              max: MAX_ROUTE_STOPS,
            })}
          />
        </XView>
        {included.length > 0 ? (
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {included.map((stop, index) => (
              <Fragment key={stop.key}>
                {index > 0 && <Divider />}
                <RouteStopRow
                  stop={stop}
                  badge={
                    stop === startStop
                      ? i18n.t('routePlan_startBadge')
                      : undefined
                  }
                  trailing={
                    <PointerTooltip label={i18n.t('routePlan_removeStop')}>
                      <IconButton
                        icon={CircleMinusIcon}
                        size={20}
                        color={theme.colors.textAlt}
                        accessibilityLabel={i18n.t(
                          'routePlan_removeStopNamed',
                          {
                            name: stop.title,
                          }
                        )}
                        onPress={() => onRemove(stop.key)}
                      />
                    </PointerTooltip>
                  }
                />
              </Fragment>
            ))}
          </Card>
        ) : (
          <Text style={footnote}>{i18n.t('routePlan_noStopsLeft')}</Text>
        )}
      </View>

      {removed.length > 0 && (
        <View style={{ gap: 8 }}>
          <RouteSectionLabel>
            {i18n.t('routePlan_removedCount', { count: removed.length })}
          </RouteSectionLabel>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {removed.map((stop, index) => (
              <Fragment key={stop.key}>
                {index > 0 && <Divider />}
                <RouteStopRow
                  stop={stop}
                  dimmed
                  trailing={
                    canRestore ? (
                      <PointerTooltip label={i18n.t('routePlan_addStopBack')}>
                        <IconButton
                          icon={CirclePlusIcon}
                          size={20}
                          color={theme.colors.accent}
                          accessibilityLabel={i18n.t(
                            'routePlan_addStopBackNamed',
                            { name: stop.title }
                          )}
                          onPress={() => onRestore(stop.key)}
                        />
                      </PointerTooltip>
                    ) : undefined
                  }
                />
              </Fragment>
            ))}
          </Card>
          {!canRestore && (
            <Text style={footnote}>
              {i18n.t('routePlan_stopLimit', { max: MAX_ROUTE_STOPS })}
            </Text>
          )}
        </View>
      )}

      {missingLocationCount > 0 && (
        <Text style={footnote}>
          {i18n.t('routePlan_missingLocation' as TranslationKey, {
            count: missingLocationCount,
          })}
        </Text>
      )}

      {error && (
        <Text
          accessibilityLiveRegion='polite'
          style={{ color: theme.colors.error }}
        >
          {routePlanErrorMessage(error)}
        </Text>
      )}

      <ActionButton
        onPress={onPlan}
        disabled={planning || included.length === 0}
        accessibilityLabel={i18n.t('routePlan_findShortest')}
      >
        {planning ? (
          <Loader style={{ height: 24, width: 24 }} />
        ) : (
          i18n.t('routePlan_findShortest')
        )}
      </ActionButton>
    </View>
  )
}
