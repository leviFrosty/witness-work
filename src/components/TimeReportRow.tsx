import { Swipeable } from 'react-native-gesture-handler'
import useTheme from '../contexts/theme'
import Haptics from '../lib/haptics'
import { ServiceReport } from '../types/serviceReport'
import SwipeableDelete from './swipeableActions/Delete'
import { Alert, View } from 'react-native'
import i18n from '../lib/locales'
import useServiceReport from '../stores/serviceReport'
import Text from './MyText'
import moment from 'moment'
import IconButton from './IconButton'
import { faPersonDigging } from '@fortawesome/free-solid-svg-icons'
import { useCallback } from 'react'
import Button from './Button'
import { useNavigation } from '@react-navigation/native'
import { useToastController } from '@tamagui/toast'
import CreditBadge from './CreditBadge'
import { RootStackNavigation } from '../types/rootStack'
import { useFormattedMinutes } from '../lib/minutes'

interface TimeReportRowProps {
  report: ServiceReport
  onPress?: () => void
}

const TimeReportRow = ({ report, onPress }: TimeReportRowProps) => {
  const theme = useTheme()
  const { deleteServiceReport } = useServiceReport()
  const navigation = useNavigation<RootStackNavigation>()
  const toast = useToastController()

  const totalMinutes = report.hours * 60 + report.minutes
  const formattedTime = useFormattedMinutes(totalMinutes)

  const handleSwipeOpen = useCallback(
    (
      direction: 'left' | 'right',
      swipeable: Swipeable,
      report: ServiceReport
    ) => {
      if (direction === 'right') {
        Alert.alert(
          i18n.t('deleteTime_title'),
          i18n.t('deleteTime_description'),
          [
            {
              text: i18n.t('cancel'),
              style: 'cancel',
              onPress: () => swipeable.reset(),
            },
            {
              text: i18n.t('delete'),
              style: 'destructive',
              onPress: () => {
                swipeable.reset()
                toast.show(i18n.t('success'), {
                  message: i18n.t('deleted'),
                  native: true,
                })
                deleteServiceReport(report)
              },
            },
          ]
        )
      }
    },
    [deleteServiceReport, toast]
  )

  return (
    <Swipeable
      key={report.id}
      onSwipeableWillOpen={() => Haptics.light()}
      containerStyle={{
        backgroundColor: theme.colors.background,
        borderRadius: theme.numbers.borderRadiusSm,
      }}
      renderRightActions={() => (
        <SwipeableDelete size='xs' style={{ flexDirection: 'row' }} />
      )}
      onSwipeableOpen={(direction, swipeable) =>
        handleSwipeOpen(direction, swipeable, report)
      }
    >
      <Button
        onPress={() => {
          if (onPress) {
            onPress()
          } else {
            navigation.navigate('Add Time', {
              existingReport: JSON.stringify(report),
            })
          }
        }}
        style={{
          backgroundColor: theme.colors.card,
          padding: 15,
          borderRadius: theme.numbers.borderRadiusSm,
          gap: 10,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            flexGrow: 1,
          }}
        >
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {`${moment(report.date).format('LL')}`}
            </Text>
          </View>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {formattedTime.formatted}
          </Text>
        </View>
        {(report.ldc || report.tag || report.note) && (
          <View style={{ gap: 5 }}>
            {(report.ldc || report.tag) && (
              <View
                style={{
                  flexDirection: 'row',
                  gap: 5,
                  alignItems: 'center',
                }}
              >
                {report.ldc && <IconButton icon={faPersonDigging} />}
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {report.ldc ? i18n.t('ldc') : report.tag}
                </Text>
                {(report.credit || report.ldc) && <CreditBadge />}
              </View>
            )}
            {report.note && (
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                  lineHeight: 18,
                }}
              >
                {report.note}
              </Text>
            )}
          </View>
        )}
      </Button>
    </Swipeable>
  )
}

export default TimeReportRow
