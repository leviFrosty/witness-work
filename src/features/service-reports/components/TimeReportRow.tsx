import { Swipeable } from 'react-native-gesture-handler'
import useTheme from '../../../contexts/theme'
import Haptics from '../../../lib/haptics'
import { ServiceReport } from '../../../types/serviceReport'
import SwipeableDelete from '../../../components/swipeableActions/Delete'
import { Alert, View } from 'react-native'
import i18n from '../../../lib/locales'
import useServiceReport from '../../../stores/serviceReport'
import Text from '../../../components/MyText'
import moment from 'moment'
import IconButton from '../../../components/IconButton'
import { faPersonDigging, faRightLeft } from '@fortawesome/free-solid-svg-icons'
import { useCallback } from 'react'
import Button from '../../../components/Button'
import { useNavigation } from '@react-navigation/native'
import { useToastController } from '@tamagui/toast'
import CreditBadge from '../../../components/CreditBadge'
import { RootStackNavigation } from '../../../types/rootStack'
import { useFormattedMinutes } from '../../../lib/minutes'
import { useCardStyle } from '../../../components/Card'

interface TimeReportRowProps {
  report: ServiceReport
  onPress?: () => void
}

const TimeReportRow = ({ report, onPress }: TimeReportRowProps) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const { deleteServiceReport, deleteRolloverPair } = useServiceReport()
  const navigation = useNavigation<RootStackNavigation>()
  const toast = useToastController()

  const totalMinutes = report.hours * 60 + report.minutes
  const formattedTime = useFormattedMinutes(Math.abs(totalMinutes))
  const isRollover = report.rollover === true
  const sign = totalMinutes < 0 ? '−' : '+'

  const handleSwipeOpen = useCallback(
    (
      direction: 'left' | 'right',
      swipeable: Swipeable,
      report: ServiceReport
    ) => {
      if (direction === 'right') {
        const isRolloverPair =
          report.rollover === true && report.rolloverGroupId !== undefined
        Alert.alert(
          isRolloverPair
            ? i18n.t('timeRollover_deletePair_title')
            : i18n.t('deleteTime_title'),
          isRolloverPair
            ? i18n.t('timeRollover_deletePair_description')
            : i18n.t('deleteTime_description'),
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
                if (isRolloverPair) {
                  deleteRolloverPair(report)
                } else {
                  deleteServiceReport(report)
                }
              },
            },
          ]
        )
      }
    },
    [deleteRolloverPair, deleteServiceReport, toast]
  )

  return (
    <Swipeable
      key={report.id}
      onSwipeableWillOpen={() => Haptics.light()}
      containerStyle={{
        backgroundColor: theme.colors.background,
        borderRadius: cardStyle.borderRadius,
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
          // Rollover entries are paired and must never be edited — would
          // imbalance the source/destination math. Block here regardless of
          // whether a caller passed a custom onPress (their intent is also
          // edit-routing). Centralizing the rule here means new call sites
          // can't accidentally bypass it.
          if (isRollover) {
            Alert.alert(
              i18n.t('timeRollover_cantEdit_title'),
              i18n.t('timeRollover_cantEdit_description')
            )
            return
          }
          if (onPress) {
            onPress()
            return
          }
          navigation.navigate('Add Time', {
            existingReport: JSON.stringify(report),
          })
        }}
        style={
          isRollover
            ? {
                backgroundColor: theme.colors.backgroundLighter,
                paddingVertical: 12,
                paddingHorizontal: 15,
                borderRadius: cardStyle.borderRadius,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: theme.colors.border,
                gap: 10,
              }
            : {
                ...cardStyle,
                paddingVertical: 12,
                paddingHorizontal: 15,
                gap: 10,
              }
        }
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexGrow: 1,
            gap: 10,
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                color: isRollover ? theme.colors.textAlt : theme.colors.text,
                flexShrink: 1,
              }}
              numberOfLines={1}
              ellipsizeMode='tail'
            >
              {`${moment(report.date).format('LL')}`}
            </Text>
          </View>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
            numberOfLines={1}
          >
            {isRollover
              ? `${sign} ${formattedTime.formatted}`
              : formattedTime.formatted}
          </Text>
        </View>
        {isRollover && (
          <View
            style={{
              flexDirection: 'row',
              gap: 6,
              alignItems: 'center',
            }}
          >
            <IconButton icon={faRightLeft} />
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {i18n.t('timeRollover_rowLabel')}
            </Text>
          </View>
        )}
        {!isRollover && (report.ldc || report.tag || report.note) && (
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
