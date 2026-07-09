import {
  CircleCheck as CircleCheckIcon,
  Square as SquareIcon,
} from 'lucide-react-native'
import * as Crypto from 'expo-crypto'
import moment from 'moment'
import { useMemo, useState } from 'react'
import { View } from 'react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useAnimation from '@/hooks/useAnimation'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import { getMonthsReports } from '@/lib/serviceReport'
import { CONFETTI_DELAY_MS } from '@/providers/AnimationViewProvider'
import { useServiceReport } from '@/stores/serviceReport'
import { TimeEntry } from '@/types/timeEntry'
import LottieView from 'lottie-react-native'

export default function PublisherCheckBoxCard() {
  const theme = useTheme()
  const [undoReport, setUndoReport] = useState<TimeEntry>()
  const { serviceReports, addServiceReport, deleteServiceReport } =
    useServiceReport()
  const { playConfetti } = useAnimation()
  const monthReports = useMemo(
    () => getMonthsReports(serviceReports, moment().month(), moment().year()),
    [serviceReports]
  )
  const hasParticipated = monthReports.length > 0

  const handleSubmitDidService = () => {
    const report: TimeEntry = {
      date: new Date(),
      hours: 0,
      minutes: 0,
      id: Crypto.randomUUID(),
    }
    addServiceReport(report)
    setUndoReport(report)
    Haptics.heavy()
    setTimeout(() => Haptics.success(), CONFETTI_DELAY_MS + 100)
    playConfetti()
  }

  if (hasParticipated) {
    return (
      <View
        style={{
          flex: 1,
          minHeight: 128,
          gap: 8,
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        {undoReport ? (
          <LottieView
            autoPlay
            loop={false}
            speed={0.875}
            style={{ width: 130, height: 96, marginVertical: -16 }}
            source={require('@/assets/lottie/checkMark.json')}
          />
        ) : (
          <LucideIcon
            icon={CircleCheckIcon}
            size={54}
            color={theme.colors.accent}
          />
        )}
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('md'),
            textAlign: 'center',
          }}
        >
          {i18n.t('sharedTheGoodNews')}
        </Text>
        {undoReport ? (
          <Button onPress={() => deleteServiceReport(undoReport)}>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('xs'),
                textDecorationLine: 'underline',
              }}
            >
              {i18n.t('undo')}
            </Text>
          </Button>
        ) : null}
      </View>
    )
  }

  return (
    <Button
      accessibilityLabel={i18n.t('sharedTheGoodNews')}
      onPress={handleSubmitDidService}
      style={{
        flex: 1,
        minHeight: 128,
        flexDirection: 'column',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 4,
        width: '100%',
      }}
    >
      <View
        style={{
          width: 58,
          height: 58,
          borderRadius: 29,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.accentTranslucent,
        }}
      >
        <LucideIcon icon={SquareIcon} size={30} color={theme.colors.accent} />
      </View>
      <Text
        style={{
          color: theme.colors.text,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('md'),
          textAlign: 'center',
        }}
      >
        {i18n.t('sharedTheGoodNews')}
      </Text>
    </Button>
  )
}
