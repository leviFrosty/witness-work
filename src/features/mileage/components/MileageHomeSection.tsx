import moment from 'moment'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { ChevronRight as ChevronRightIcon } from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import useMileage from '@/stores/mileage'
import Card from '@/components/ui/Card'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import HomeSectionMenu from '@/components/HomeSectionMenu'
import {
  periodContaining,
  summarizeTrips,
  tripsInPeriod,
} from '@/lib/mileage/calc'
import MileageSummary from '@/features/mileage/components/MileageSummary'
import MileageEmptyState from '@/features/mileage/components/MileageEmptyState'
import LogTripButton from '@/features/mileage/components/LogTripButton'
import useMileageFormatter from '@/features/mileage/hooks/useMileageFormatter'
import useMileageIndex from '@/features/mileage/hooks/useMileageIndex'
import useLogTrip from '@/features/mileage/hooks/useLogTrip'
import type { RootStackNavigation } from '@/types/rootStack'

/** Home's Mileage section: this month's totals and a Log Trip button. */
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
            <MileageSummary
              summary={summary}
              vehicles={vehicles}
              format={format}
            />
            {monthTrips.length > 0 && summary.cost === undefined && (
              <MileageEmptyState variant='costHint' />
            )}
            <LogTripButton onPress={logTrip} />
          </>
        )}
      </View>
    </Card>
  )
}
