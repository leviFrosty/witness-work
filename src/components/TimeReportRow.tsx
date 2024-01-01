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

interface TimeReportRowProps {
  report: ServiceReport
}

const TimeReportRow = ({ report }: TimeReportRowProps) => {
  const theme = useTheme()
  const { deleteServiceReport } = useServiceReport()

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
                deleteServiceReport(report.id)
              },
            },
          ]
        )
      }
    },
    [deleteServiceReport]
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
      <View
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
            flexGrow: 1,
          }}
        >
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {`${moment(report.date).format('ddd L')}`}
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              flexGrow: 1,
              justifyContent: 'flex-end',
              alignItems: 'center',
            }}
          >
            <View
              style={{
                position: 'relative',
                paddingLeft: 20,
              }}
            >
              <Text style={{ fontSize: 12 }}>{i18n.t('hours')}</Text>
              <Text
                style={{
                  position: 'absolute',
                  left: 0,
                  fontSize: 12,
                }}
              >
                {report.hours}
              </Text>
            </View>
            <View
              style={{
                position: 'relative',
                paddingLeft: 20,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  flexDirection: 'row',
                  fontSize: 12,
                }}
              >
                {i18n.t('minutes')}
              </Text>
              <Text
                style={{
                  position: 'absolute',
                  left: 0,
                  fontSize: 12,
                }}
              >
                {report.minutes}
              </Text>
            </View>
          </View>
        </View>
        {(report.ldc || report.tag) && (
          <View>
            <View
              style={{
                flexDirection: 'row',
                gap: 3,
                alignItems: 'center',
              }}
            >
              {report.ldc && <IconButton icon={faPersonDigging} />}
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('xs'),
                }}
              >
                {report.ldc ? i18n.t('ldc') : report.tag}
              </Text>
            </View>
          </View>
        )}
      </View>
    </Swipeable>
  )
}

export default TimeReportRow
