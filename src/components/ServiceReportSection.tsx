import { View } from 'react-native'
import useTheme from '../contexts/theme'
import { usePreferences } from '../stores/preferences'
import Card from './Card'
import Text from './MyText'
import moment from 'moment'
import i18n from '../lib/locales'
import IconButton from './IconButton'
import { faArrowUpFromBracket } from '@fortawesome/free-solid-svg-icons'
import { ExportTimeSheetState } from './ExportTimeSheet'
import useDevice from '../hooks/useDevice'
import HourEntryCard from './HourEntryCard'
import PublisherCheckBoxCard from './PublisherCheckBoxCard'
import StudiesCard from './StudiesCard'

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

interface ServiceReportProps {
  setSheet: React.Dispatch<React.SetStateAction<ExportTimeSheetState>>
}

const ServiceReportSection = ({ setSheet }: ServiceReportProps) => {
  const theme = useTheme()
  const { publisher } = usePreferences()
  const { isTablet } = useDevice()

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Text
          style={{
            fontSize: 14,
            fontFamily: theme.fonts.semiBold,
            marginLeft: 5,
          }}
        >
          {i18n.t('serviceReport')}
        </Text>
        <IconButton
          icon={faArrowUpFromBracket}
          size='sm'
          onPress={() =>
            setSheet({
              open: true,
              month: moment().month(),
              year: moment().year(),
            })
          }
        />
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
              flexDirection: 'column',
              gap: 5,
              flexGrow: isTablet ? 1 : undefined,
              maxWidth: isTablet ? 800 : '60%',
            }}
          >
            <View style={{ flexDirection: 'row' }}>
              <RowSectionTitle title={i18n.t('hours')} />
            </View>
            {publisher === 'publisher' ? (
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
