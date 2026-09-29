import { View } from 'react-native'
import {
  ChevronRight as ChevronRightIcon,
  Plus as PlusIcon,
} from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import moment from 'moment'
import i18n from '@/lib/locales'
import HourEntryCard from '@/features/service-reports/components/HourEntryCard'
import ServiceReportTimeOverlay from '@/features/service-reports/components/ServiceReportTimeOverlay'
import PublisherCheckBoxCard from '@/features/service-reports/components/PublisherCheckBoxCard'
import StudiesCard from '@/features/service-reports/components/StudiesCard'
import ServiceReportStudiesOverlay from '@/features/service-reports/components/ServiceReportStudiesOverlay'
import AuxiliaryMonthRow from '@/features/service-reports/components/AuxiliaryMonthRow'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '@/types/rootStack'
import HomeSectionMenu from '@/components/HomeSectionMenu'
import useMonthReportExport from '@/features/service-reports/hooks/useMonthReportExport'

const ServiceReportSection = () => {
  const theme = useTheme()
  const { entryMode, showsTimeEntry } = usePublisher()
  const navigation = useNavigation<RootStackNavigation>()
  const month = moment().month()
  const year = moment().year()

  const { reportMenuItems } = useMonthReportExport()

  const viewReport = () =>
    navigation.navigate('ServiceReportView', { month, year })
  const addTime = () => navigation.navigate('Add Time')

  return (
    <Card
      style={{
        paddingHorizontal: 0,
        paddingVertical: 0,
        gap: 0,
        overflow: 'hidden',
      }}
    >
      {/* Only the header long-presses: the card body is full of controls
        with their own menus. */}
      <HomeSectionMenu
        section='serviceReport'
        accessibilityLabel={i18n.t('viewReport')}
        onPress={viewReport}
        actions={[
          [
            {
              id: 'view_report',
              title: i18n.t('viewReport'),
              systemImage: 'doc.text',
              onPress: viewReport,
            },
            ...reportMenuItems(month, year),
          ],
          showsTimeEntry && [
            {
              id: 'add_time',
              title: i18n.t('addTime'),
              systemImage: 'plus',
              onPress: addTime,
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
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('serviceReport')}
          </Text>
          <LucideIcon
            icon={ChevronRightIcon}
            size={16}
            color={theme.colors.textAlt}
          />
        </View>
      </HomeSectionMenu>

      <View
        style={{
          gap: 18,
          padding: 20,
          paddingTop: 16,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            gap: 18,
            alignItems: 'stretch',
          }}
        >
          {entryMode === 'checkbox' ? (
            <View style={{ flex: 2 }}>
              <PublisherCheckBoxCard />
            </View>
          ) : (
            <ServiceReportTimeOverlay containerStyle={{ flex: 1 }}>
              <HourEntryCard />
            </ServiceReportTimeOverlay>
          )}
          <ServiceReportStudiesOverlay
            containerStyle={{
              flex: 1,
              paddingLeft: 18,
              borderLeftWidth: 1,
              borderLeftColor: theme.colors.border,
            }}
          >
            <StudiesCard />
          </ServiceReportStudiesOverlay>
        </View>

        {showsTimeEntry ? (
          <Button
            variant='glass'
            glassTint={theme.colors.accent}
            accessibilityLabel={i18n.t('addTime')}
            onPress={addTime}
            style={{
              width: '100%',
              minHeight: 48,
              paddingVertical: 13,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: theme.colors.accent,
              borderRadius: theme.numbers.borderRadiusMd,
            }}
          >
            <LucideIcon
              icon={PlusIcon}
              size={18}
              color={theme.colors.textInverse}
            />
            <Text
              style={{
                color: theme.colors.textInverse,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('md'),
              }}
            >
              {i18n.t('addTime')}
            </Text>
          </Button>
        ) : null}
        <AuxiliaryMonthRow source='home' statusOnly />
      </View>
    </Card>
  )
}

export default ServiceReportSection
