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
import PublisherCheckBoxCard from '@/features/service-reports/components/PublisherCheckBoxCard'
import StudiesCard from '@/features/service-reports/components/StudiesCard'
import SubmitPreviousReportButton from '@/features/service-reports/components/SubmitPreviousReportButton'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '@/types/rootStack'

const ServiceReportSection = () => {
  const theme = useTheme()
  const { entryMode } = usePublisher()
  const navigation = useNavigation<RootStackNavigation>()
  const month = moment().month()
  const year = moment().year()

  const viewReport = () =>
    navigation.navigate('ServiceReportView', { month, year })

  return (
    <Card
      style={{
        paddingHorizontal: 0,
        paddingVertical: 0,
        gap: 0,
        overflow: 'hidden',
      }}
    >
      <Button
        accessibilityLabel={i18n.t('viewReport')}
        onPress={viewReport}
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
      </Button>

      <View
        style={{
          gap: 18,
          padding: 20,
          paddingTop: 16,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        }}
      >
        <SubmitPreviousReportButton />
        <View
          style={{
            flexDirection: 'row',
            gap: 18,
            alignItems: 'stretch',
          }}
        >
          <View
            style={{
              flex: entryMode === 'checkbox' ? 2 : 1,
            }}
          >
            {entryMode === 'checkbox' ? (
              <PublisherCheckBoxCard />
            ) : (
              <HourEntryCard />
            )}
          </View>
          <View
            style={{
              flex: 1,
              paddingLeft: 18,
              borderLeftWidth: 1,
              borderLeftColor: theme.colors.border,
            }}
          >
            <StudiesCard />
          </View>
        </View>

        {entryMode === 'hours' ? (
          <Button
            variant='glass'
            glassTint={theme.colors.accent}
            accessibilityLabel={i18n.t('addTime')}
            onPress={() => navigation.navigate('Add Time')}
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
      </View>
    </Card>
  )
}

export default ServiceReportSection
