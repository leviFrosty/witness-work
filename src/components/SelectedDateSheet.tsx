import { View } from 'react-native'
import { Sheet } from 'tamagui'
import Text from './MyText'
import i18n from '../lib/locales'
import useTheme from '../contexts/theme'
import moment from 'moment'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../stacks/RootStack'
import { FlashList } from '@shopify/flash-list'
import { ServiceReport } from '../types/serviceReport'
import TimeReportRow from './TimeReportRow'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import ActionButton from './ActionButton'
import Card from './Card'
import { useMemo } from 'react'

export type SelectedDateSheetState = {
  open: boolean
  date: Date
}

interface Props {
  sheet: SelectedDateSheetState
  setSheet: React.Dispatch<React.SetStateAction<SelectedDateSheetState>>
  thisMonthsReports: ServiceReport[] | null
}

const SelectedDateSheet: React.FC<Props> = ({
  sheet,
  setSheet,
  thisMonthsReports,
}) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const thisDaysReports = useMemo(
    () =>
      thisMonthsReports?.filter((r) =>
        moment(r.date).isSame(sheet.date, 'day')
      ),
    [sheet.date, thisMonthsReports]
  )

  return (
    <Sheet
      open={sheet.open}
      onOpenChange={(o: boolean) => setSheet({ ...sheet, open: o })}
      dismissOnSnapToBottom
      modal
      snapPoints={[70]}
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        <View
          style={{
            paddingHorizontal: 30,
            gap: 10,
            flex: 1,
            paddingTop: 30,
            paddingBottom: 50,
          }}
        >
          <View style={{ marginBottom: 10, gap: 5 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: theme.fontSize('xl'),
                fontFamily: theme.fonts.bold,
              }}
            >
              {moment(sheet.date).format('LL')}
            </Text>
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('viewTimeReportsForThisDate')}
            </Text>
          </View>
          <KeyboardAwareScrollView contentContainerStyle={{ minHeight: 10 }}>
            <FlashList
              scrollEnabled={false}
              data={
                thisDaysReports
                  ? thisDaysReports.sort((a, b) =>
                      moment(a.date).unix() < moment(b.date).unix() ? 1 : -1
                    )
                  : undefined
              }
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => <TimeReportRow report={item} />}
              estimatedItemSize={66}
              ListEmptyComponent={
                <Card>
                  <Text>{i18n.t('noReportsThisDay')}</Text>
                </Card>
              }
            />
          </KeyboardAwareScrollView>
          <ActionButton
            onPress={() =>
              navigation.navigate('Add Time', {
                date: sheet.date.toISOString(),
              })
            }
          >
            <Text style={{ color: theme.colors.textInverse }}>
              {i18n.t('addTime')}
            </Text>
          </ActionButton>
        </View>
      </Sheet.Frame>
    </Sheet>
  )
}

export default SelectedDateSheet
