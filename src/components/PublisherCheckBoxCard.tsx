import { getMonthsReports } from '../lib/serviceReport'
import { useServiceReport } from '../stores/serviceReport'
import * as Crypto from 'expo-crypto'
import LottieView from 'lottie-react-native'
import { faSquare } from '@fortawesome/free-regular-svg-icons'
import Button from './Button'
import { ServiceReport as ServiceReportType } from '../types/serviceReport'
import useTheme from '../contexts/theme'
import Text from './MyText'
import i18n from '../lib/locales'
import { View } from 'react-native'
import { useMemo, useState } from 'react'
import moment from 'moment'
import IconButton from './IconButton'
import Haptics from '../lib/haptics'
import useAnimation from '../hooks/useAnimation'
import { CONFETTI_DELAY_MS } from '../providers/AnimationViewProvider'

const CheckMarkAnimationComponent = ({
  undoReport,
}: {
  undoReport?: ServiceReportType
}) => {
  const theme = useTheme()
  const { deleteServiceReport } = useServiceReport()

  return (
    <View
      style={{
        backgroundColor: theme.colors.backgroundLighter,
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
      }}
    >
      <LottieView
        autoPlay={true}
        loop={false}
        style={{
          width: 140,
          height: 120,
        }}
        speed={0.875}
        // Find more Lottie files at https://lottiefiles.com/featured
        source={require('./../assets/lottie/checkMark.json')}
      />
      {undoReport && (
        <Button onPress={() => deleteServiceReport(undoReport)}>
          <Text
            style={{
              fontSize: 10,
              color: theme.colors.textAlt,
              textDecorationLine: 'underline',
            }}
          >
            {i18n.t('undo')}
          </Text>
        </Button>
      )}
    </View>
  )
}

export default function PublisherCheckBoxCard() {
  const theme = useTheme()
  const [undoReport, setUndoReport] = useState<ServiceReportType>()
  const { serviceReports, addServiceReport } = useServiceReport()

  const { playConfetti } = useAnimation()
  const monthReports = useMemo(
    () => getMonthsReports(serviceReports, moment().month(), moment().year()),
    [serviceReports]
  )
  const hasGoneOutInServiceThisMonth = !!monthReports.length

  const handleSubmitDidService = () => {
    const id = Crypto.randomUUID()
    const report: ServiceReportType = {
      date: new Date(),
      hours: 0,
      minutes: 0,
      id,
    }
    addServiceReport(report)
    setUndoReport(report)
    Haptics.heavy()
    setTimeout(() => {
      Haptics.success()
    }, CONFETTI_DELAY_MS + 100)
    playConfetti()
  }

  return (
    <View>
      {hasGoneOutInServiceThisMonth ? (
        <View
          style={{
            backgroundColor: hasGoneOutInServiceThisMonth
              ? theme.colors.backgroundLighter
              : theme.colors.accent,
            borderColor: theme.colors.border,
            paddingVertical: hasGoneOutInServiceThisMonth ? 5 : 46,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: theme.numbers.borderRadiusSm,
            overflow: 'hidden',
          }}
        >
          <CheckMarkAnimationComponent undoReport={undoReport} />
        </View>
      ) : (
        <Button
          style={{
            backgroundColor: hasGoneOutInServiceThisMonth
              ? theme.colors.backgroundLighter
              : theme.colors.accent,
            borderColor: theme.colors.border,
            paddingVertical: hasGoneOutInServiceThisMonth ? 5 : 46,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: theme.numbers.borderRadiusLg,
            paddingHorizontal: 25,
          }}
          onPress={handleSubmitDidService}
        >
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <IconButton
              icon={faSquare}
              size='xl'
              iconStyle={{ color: theme.colors.textInverse }}
            />
            <Text
              style={{
                color: theme.colors.textInverse,
                fontSize: 18,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('sharedTheGoodNews')}
            </Text>
          </View>
        </Button>
      )}
    </View>
  )
}
