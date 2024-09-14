import { Sheet } from 'tamagui'
import Button from '../components/Button'
import * as Clipboard from 'expo-clipboard'
import { usePreferences } from '../stores/preferences'
import { getStudiesForGivenMonth } from '../lib/contacts'
import useConversations from '../stores/conversationStore'
import useContacts from '../stores/contactsStore'
import { Share, View } from 'react-native'
import IconButton from './IconButton'
import i18n from '../lib/locales'
import Text from './MyText'
import {
  faArrowUpFromBracket,
  faCopy,
  faGlobeAmericas,
  faHourglass,
  faTimes,
} from '@fortawesome/free-solid-svg-icons'
import moment from 'moment'
import Haptics from '../lib/haptics'
import { useCallback, useMemo } from 'react'
import {
  AdjustedMinutes,
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
  getTimeAsMinutesForHourglass,
} from '../lib/serviceReport'
import useTheme from '../contexts/theme'
import useServiceReport from '../stores/serviceReport'
import { useNavigation } from '@react-navigation/native'
import links from '../constants/links'
import { openURL } from '../lib/links'
import { HomeTabStackNavigation } from '../types/homeStack'

export type ExportTimeSheetState = {
  open: boolean
  month: number | undefined
  year: number | undefined
}

interface ExportTimeSheetProps {
  sheet: ExportTimeSheetState
  setSheet: React.Dispatch<React.SetStateAction<ExportTimeSheetState>>
  showViewAllMonthsButton?: boolean
}

const ExportTimeSheet = ({
  sheet,
  setSheet,
  showViewAllMonthsButton,
}: ExportTimeSheetProps) => {
  const { publisher } = usePreferences()
  const theme = useTheme()
  const { serviceReports } = useServiceReport()
  const { conversations } = useConversations()
  const { contacts } = useContacts()
  const { month, year } = sheet
  const navigation = useNavigation<HomeTabStackNavigation>()
  const monthReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [month, serviceReports, year]
  )

  const { creditOverage, value, credit, standard }: AdjustedMinutes = useMemo(
    () =>
      month !== undefined && year !== undefined
        ? adjustedMinutesForSpecificMonth(monthReports, month, year)
        : { value: 0, creditOverage: 0, credit: 0, standard: 0 },
    [month, monthReports, year]
  )

  const studiesForMonth = useMemo(
    () =>
      month !== undefined && year !== undefined
        ? getStudiesForGivenMonth({
            contacts,
            conversations,
            month: moment().month(month).year(year).toDate(),
          })
        : null,
    [contacts, conversations, month, year]
  )

  const isLastMonth = (() => {
    if (!month || !year) {
      return false
    }
    const providedMonth = moment().month(month).year(year)
    const isLastMonth = moment()
      .subtract(1, 'month')
      .isSame(providedMonth, 'month')
    return isLastMonth
  })()

  const handleAction = useCallback(
    async (action: 'copy' | 'hourglass' | 'share' | 'nwpublisher') => {
      const reportAsString = () => {
        if (month === undefined || year === undefined) {
          return ''
        }
        const hoursForPublisherOrPioneer = () => {
          if (publisher === 'publisher') {
            if (monthReports.length) {
              return i18n.t('yes')
            } else {
              return i18n.t('no')
            }
          }
          return Math.floor(standard / 60)
        }

        return `${i18n.t('serviceReport')} - ${moment()
          .month(month)
          .format('MMM')} ${year}\n\n---\n\n${i18n.t(
          'hours'
        )}: ${hoursForPublisherOrPioneer()}\n${i18n.t('credit')}: ${Math.floor(credit / 60)}\n${i18n.t(
          'studies'
        )}: ${studiesForMonth}\n${i18n.t('notes')}:\n${
          creditOverage
            ? `\n${i18n.t('creditOverageInTheAmountOf', {
                count: Math.floor(creditOverage / 60),
              })}`
            : ''
        }`
      }

      switch (action) {
        case 'copy': {
          Haptics.success()
          await Clipboard.setStringAsync(reportAsString())
          break
        }

        case 'hourglass': {
          const hourglassMonth = (month || 0) + 1

          const hourglassSubmitLink = `${
            links.hourglassBase
          }month=${hourglassMonth}&year=${year}&minutes=${getTimeAsMinutesForHourglass(
            publisher,
            !!monthReports.length,
            value
          )}&studies=${studiesForMonth}&remarks=${encodeURI(
            i18n.t('creditOverageInTheAmountOf', {
              count: Math.floor(creditOverage / 60),
            })
          )}`

          openURL(hourglassSubmitLink)

          break
        }

        case 'nwpublisher': {
          if (!month || !year) {
            return
          }
          if (!isLastMonth) {
            // NW Publisher only allows submissions for the previous month
            return
          }

          let nwPublisherLink = `${links.nwpublisherSubmitReport}sharedInMinistry=${!!monthReports.length}`

          const { creditOverage, credit, standard } =
            adjustedMinutesForSpecificMonth(monthReports, month, year)

          if (standard > 0) {
            nwPublisherLink += `:hours=${Math.floor(standard / 60)}`
          }

          if (credit) {
            nwPublisherLink += `:credit=${Math.floor(credit / 60)}`
          }

          if (studiesForMonth !== null && studiesForMonth > 0) {
            nwPublisherLink += `:bibleStudies=${studiesForMonth}`
          }

          const remarks = i18n
            .t('creditOverageInTheAmountOf', {
              count: Math.floor(creditOverage / 60),
            })
            .replaceAll(':', '-') // NW Publisher uses : as a delimiter, remove this.
          if (creditOverage) {
            nwPublisherLink += `:remarks=${encodeURI(remarks)}`
          }

          break
          openURL(nwPublisherLink)
          break
        }

        case 'share': {
          await Share.share({ message: reportAsString() })
          break
        }
      }

      setSheet({ open: false, month: 0, year: 0 })
    },
    [
      setSheet,
      month,
      year,
      credit,
      studiesForMonth,
      creditOverage,
      publisher,
      standard,
      monthReports,
      value,
      isLastMonth,
    ]
  )

  if (month === undefined || year === undefined) {
    return null
  }

  return (
    <Sheet
      open={sheet.open}
      onOpenChange={(o: boolean) => setSheet({ ...sheet, open: o })}
      dismissOnSnapToBottom
      modal
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        <View style={{ padding: 30, gap: 15 }}>
          <View style={{ marginBottom: 20 }}>
            {showViewAllMonthsButton && (
              <Button
                onPress={() => {
                  navigation.navigate('Month', {
                    month: moment().month(),
                    year: moment().year(),
                  })
                  setSheet({ open: false, month: 0, year: 0 })
                }}
              >
                <Text
                  style={{
                    fontSize: theme.fontSize('sm'),
                    color: theme.colors.textAlt,
                    textDecorationLine: 'underline',
                    marginBottom: 10,
                  }}
                >
                  {i18n.t('viewAllMonths')}
                </Text>
              </Button>
            )}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('xl'),
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                }}
              >
                {i18n.t('export')}{' '}
                {sheet.month !== undefined &&
                  sheet.year &&
                  moment()
                    .month(sheet.month)
                    .year(sheet.year)
                    .format('MMMM, YYYY')}
              </Text>

              <IconButton
                icon={faTimes}
                size='xl'
                onPress={() => setSheet({ open: false, month: 0, year: 0 })}
              />
            </View>
          </View>
          <View style={{ gap: 5 }}>
            <Button
              onPress={() => handleAction('nwpublisher')}
              variant={isLastMonth ? 'solid' : 'outline'}
              style={{
                backgroundColor: isLastMonth ? theme.colors.card : undefined,
              }}
              disabled={!isLastMonth}
            >
              <View
                style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}
              >
                <IconButton icon={faGlobeAmericas} />
                <Text style={{ color: theme.colors.text }}>
                  {i18n.t('nwPublisher')}
                </Text>
              </View>
            </Button>
            {!isLastMonth && (
              <View>
                <Text
                  style={{
                    fontSize: theme.fontSize('sm'),
                    color: theme.colors.textAlt,
                  }}
                >
                  {i18n.t('nwPublisherOnlyAllowsLastMonth')}
                </Text>
                <Button
                  onPress={() => {
                    if (month === 0) {
                      setSheet({ open: true, month: 11, year: year - 1 })
                    } else {
                      setSheet({ open: true, month: month - 1, year })
                    }
                  }}
                >
                  <Text
                    style={{
                      textDecorationLine: 'underline',
                      fontFamily: theme.fonts.semiBold,
                    }}
                  >
                    {i18n.t('submitLastMonth')}
                  </Text>
                </Button>
              </View>
            )}
          </View>
          <Button
            onPress={() => handleAction('hourglass')}
            variant='solid'
            style={{ backgroundColor: theme.colors.card }}
          >
            <View
              style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}
            >
              <IconButton icon={faHourglass} />
              <Text style={{ color: theme.colors.text }}>
                {i18n.t('hourglass')}
              </Text>
            </View>
          </Button>

          <Button
            onPress={() => handleAction('copy')}
            variant='solid'
            style={{ backgroundColor: theme.colors.card }}
          >
            <View
              style={{
                flexDirection: 'row',
                gap: 10,
                alignItems: 'center',
              }}
            >
              <IconButton icon={faCopy} />
              <Text style={{ color: theme.colors.text }}>
                {i18n.t('copyToClipboard')}
              </Text>
            </View>
          </Button>
          <Button
            onPress={() => handleAction('share')}
            variant='solid'
            style={{ backgroundColor: theme.colors.card }}
          >
            <View
              style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}
            >
              <IconButton icon={faArrowUpFromBracket} />
              <Text style={{ color: theme.colors.text }}>
                {i18n.t('share')}
              </Text>
            </View>
          </Button>
        </View>
      </Sheet.Frame>
    </Sheet>
  )
}

export default ExportTimeSheet
