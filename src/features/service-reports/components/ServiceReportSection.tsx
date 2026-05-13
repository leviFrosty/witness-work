import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import moment from 'moment'
import i18n from '@/lib/locales'
import useDevice from '@/hooks/useDevice'
import HourEntryCard from '@/features/service-reports/components/HourEntryCard'
import PublisherCheckBoxCard from '@/components/PublisherCheckBoxCard'
import StudiesCard from '@/features/service-reports/components/StudiesCard'
import ViewReportButton from '@/features/service-reports/components/ViewReportButton'

const RowSectionTitle = ({
  title,
  underline,
}: {
  title: string
  underline?: boolean
}) => {
  const theme = useTheme()

  return (
    <Text
      style={{
        color: theme.colors.textAlt,
        fontFamily: theme.fonts.semiBold,
        textDecorationLine: underline ? 'underline' : 'none',
      }}
    >
      {title}
    </Text>
  )
}

const ServiceReportSection = () => {
  const theme = useTheme()
  const { entryMode } = usePublisher()
  const { isTablet } = useDevice()

  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 5,
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontFamily: theme.fonts.semiBold,
            marginLeft: 5,
          }}
        >
          {i18n.t('serviceReport')}
        </Text>
        <ViewReportButton month={moment().month()} year={moment().year()} />
      </View>

      <Card>
        <View
          style={{
            flexDirection: 'row',
            gap: 3,
          }}
        >
          <View
            style={{
              flex: 2,
              gap: 5,
              width: '100%',
              maxWidth: isTablet ? 800 : '60%',
            }}
          >
            <View style={{ flexDirection: 'row' }}>
              <RowSectionTitle title={i18n.t('hours')} />
            </View>
            {entryMode === 'checkbox' ? (
              <PublisherCheckBoxCard />
            ) : (
              <HourEntryCard />
            )}
          </View>
          <View
            style={{
              flexDirection: 'column',
              gap: 5,
              flexGrow: 1,
              maxWidth: '40%',
            }}
          >
            <RowSectionTitle title={i18n.t('studies')} />
            <StudiesCard />
          </View>
        </View>
      </Card>
    </View>
  )
}

export default ServiceReportSection
