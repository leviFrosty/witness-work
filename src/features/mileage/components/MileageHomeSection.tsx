import moment from 'moment'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import {
  Car as CarIcon,
  ChevronRight as ChevronRightIcon,
  Fuel as FuelIcon,
  Plus as PlusIcon,
  Route as RouteIcon,
} from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import useMileage from '@/stores/mileage'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import HomeSectionMenu from '@/components/HomeSectionMenu'
import {
  periodContaining,
  summarizeTrips,
  tripsInPeriod,
} from '@/lib/mileage/calc'
import MileageDailyChart from '@/features/mileage/components/MileageDailyChart'
import MileageEmptyState from '@/features/mileage/components/MileageEmptyState'
import useMileageFormatter from '@/features/mileage/hooks/useMileageFormatter'
import useMileageIndex from '@/features/mileage/hooks/useMileageIndex'
import useLogTrip from '@/features/mileage/hooks/useLogTrip'
import type { RootStackNavigation } from '@/types/rootStack'

function Fact({
  icon,
  label,
  info,
}: {
  icon: AppIcon
  label: string
  info?: string
}) {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <LucideIcon icon={icon} size={14} color={theme.colors.accent} />
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      {info && <InfoPopover title={label} description={info} inline />}
    </View>
  )
}

/**
 * Home's Mileage section: this month's distance, a per-day chart, and a Log
 * Trip action. Deliberately shaped unlike the Service Report card (icon badge,
 * chart, compact action) so the two don't read as the same section.
 */
export default function MileageHomeSection() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { vehicles, trips } = useMileage()
  const index = useMileageIndex()
  const format = useMileageFormatter()
  const logTrip = useLogTrip('home_section')
  const month = periodContaining('month', moment())
  const monthTrips = tripsInPeriod(trips, month)
  const summary = summarizeTrips(monthTrips, index, vehicles)
  const openMileage = () => navigation.navigate('Mileage')

  return (
    <Card
      style={{
        paddingHorizontal: 0,
        paddingVertical: 0,
        gap: 0,
        overflow: 'hidden',
      }}
    >
      <HomeSectionMenu
        section='mileage'
        accessibilityLabel={i18n.t('mileage.title')}
        onPress={openMileage}
        actions={[
          [
            {
              id: 'log_trip',
              title: i18n.t('mileage.logTrip'),
              systemImage: 'plus',
              onPress: logTrip,
            },
            {
              id: 'mileage_settings',
              title: i18n.t('mileage.settings'),
              systemImage: 'gearshape',
              onPress: () => navigation.navigate('MileageSettings'),
            },
          ],
        ]}
      >
        <View
          style={{
            minHeight: 48,
            paddingHorizontal: 20,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
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
              <LucideIcon
                icon={CarIcon}
                size={18}
                color={theme.colors.accent}
              />
            </View>
            <View style={{ gap: 2 }}>
              <Text
                style={{
                  fontSize: theme.fontSize('lg'),
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('mileage.title')}
              </Text>
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  color: theme.colors.textAlt,
                }}
              >
                {month.start.format('MMMM')}
              </Text>
            </View>
          </View>
          <LucideIcon
            icon={ChevronRightIcon}
            size={16}
            color={theme.colors.textAlt}
          />
        </View>
      </HomeSectionMenu>
      <View
        style={{
          gap: 16,
          padding: 20,
          paddingTop: 16,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        }}
      >
        {vehicles.length === 0 ? (
          <MileageEmptyState source='home_section' />
        ) : (
          <>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={{
                    fontSize: theme.fontSize('3xl'),
                    fontFamily: theme.fonts.bold,
                  }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {format.distance(summary.distanceMiles)}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    columnGap: 14,
                    rowGap: 4,
                  }}
                >
                  <Fact
                    icon={RouteIcon}
                    label={i18n.t('mileage.tripCount' as TranslationKey, {
                      count: summary.tripCount,
                    })}
                  />
                  {summary.cost !== undefined && (
                    <Fact
                      icon={FuelIcon}
                      label={format.cost(summary.cost)}
                      info={[
                        i18n.t('mileage.estimatedCost_info'),
                        summary.costIncomplete &&
                          i18n.t('mileage.costIncomplete'),
                      ]
                        .filter(Boolean)
                        .join('\n\n')}
                    />
                  )}
                </View>
              </View>
              <Button
                variant='glass'
                glassTint={theme.colors.accentTranslucent}
                accessibilityLabel={i18n.t('mileage.logTrip')}
                onPress={logTrip}
                style={{
                  minHeight: 40,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: theme.colors.accentTranslucent,
                  borderRadius: 20,
                }}
              >
                <LucideIcon
                  icon={PlusIcon}
                  size={16}
                  color={theme.colors.accent}
                />
                <Text
                  style={{
                    color: theme.colors.accent,
                    fontFamily: theme.fonts.semiBold,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {i18n.t('mileage.logTrip')}
                </Text>
              </Button>
            </View>
            <MileageDailyChart period={month} trips={monthTrips} />
            {monthTrips.length > 0 && summary.cost === undefined && (
              <MileageEmptyState variant='costHint' />
            )}
          </>
        )}
      </View>
    </Card>
  )
}
