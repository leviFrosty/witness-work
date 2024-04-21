import { View } from 'react-native'
import i18n from '../lib/locales'
import Text from './MyText'
import XView from './layout/XView'
import useTheme from '../contexts/theme'
import Button from './Button'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../stacks/RootStack'
import IconButton from './IconButton'
import { faUpRightFromSquare } from '@fortawesome/free-solid-svg-icons'
import moment from 'moment'

const size = 15

const Box = (props: { color: string }) => {
  const theme = useTheme()
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: props.color,
        borderRadius: theme.numbers.borderRadiusSm,
      }}
    />
  )
}

const CalendarKey = (props: {
  showPlanSchedule?: {
    month: number
    year: number
  }
}) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const currentMonth =
    props.showPlanSchedule?.month && props.showPlanSchedule.year
      ? moment()
          .month(props.showPlanSchedule.month)
          .year(props.showPlanSchedule.year)
      : undefined

  return (
    <View
      style={{
        flexDirection: 'column',
        gap: 12,
        width: '100%',
        paddingBottom: 10,
        borderBottomColor: theme.colors.border,
        borderBottomWidth: 1,
        marginBottom: 15,
      }}
    >
      <XView style={{ justifyContent: 'space-between' }}>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('colorKey')}
        </Text>
        {props.showPlanSchedule &&
          moment().isSameOrBefore(currentMonth, 'month') && (
            <Button
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: theme.colors.accentTranslucent,
                borderColor: theme.colors.accent,
                borderWidth: 1,
                paddingHorizontal: 15,
                paddingVertical: 5,
                borderRadius: theme.numbers.borderRadiusLg,
              }}
              onPress={() =>
                navigation.navigate('PlanSchedule', {
                  month: props.showPlanSchedule!.month,
                  year: props.showPlanSchedule!.year,
                })
              }
            >
              <Text
                style={{
                  color: theme.colors.accent,
                  fontSize: theme.fontSize('sm'),
                  fontFamily: theme.fonts.medium,
                  textDecorationLine: 'underline',
                }}
              >
                {i18n.t('planSchedule')}
              </Text>
              <IconButton
                icon={faUpRightFromSquare}
                size={9}
                color={theme.colors.accent}
              />
            </Button>
          )}
      </XView>
      <XView style={{ gap: 15 }}>
        <XView>
          <Text style={{ fontSize: theme.fontSize('sm') }}>
            {i18n.t('missed')}
          </Text>
          <Box color={theme.colors.errorTranslucent} />
        </XView>
        <XView>
          <Text style={{ fontSize: theme.fontSize('sm') }}>
            {i18n.t('partial')}
          </Text>
          <Box color={theme.colors.warnTranslucent} />
        </XView>
        <XView>
          <Text style={{ fontSize: theme.fontSize('sm') }}>
            {i18n.t('completed')}
          </Text>
          <Box color={theme.colors.accentTranslucent} />
        </XView>
        <XView>
          <Text style={{ fontSize: theme.fontSize('sm') }}>
            {i18n.t('planned')}
          </Text>
          <Box color={theme.colors.backgroundLighter} />
        </XView>
      </XView>
    </View>
  )
}

export default CalendarKey
