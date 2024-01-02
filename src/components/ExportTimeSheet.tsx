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
  faHourglass,
  faTimes,
} from '@fortawesome/free-solid-svg-icons'
import moment from 'moment'
import Haptics from '../lib/haptics'
import { useCallback, useMemo } from 'react'
import {
  getTimeAsMinutesForHourglass,
  hasServiceReportsForMonth,
  otherHoursForSpecificMonth,
  totalHoursForSpecificMonth,
} from '../lib/serviceReport'
import useTheme from '../contexts/theme'
import useServiceReport from '../stores/serviceReport'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../stacks/RootStack'
import links from '../constants/links'
import { openURL } from '../lib/links'

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
  const navigation = useNavigation<RootStackNavigation>()

  const hours = useMemo(
    () =>
      month && year
        ? totalHoursForSpecificMonth(serviceReports, month, year)
        : null,
    [month, serviceReports, year]
  )

  const studiesForMonth = useMemo(
    () =>
      month && year
        ? getStudiesForGivenMonth({
            contacts,
            conversations,
            month: moment().month(month).year(year).toDate(),
          })
        : null,
    [contacts, conversations, month, year]
  )

  const wentOutForMonth = useMemo(
    () =>
      month && year
        ? hasServiceReportsForMonth(serviceReports, month, year)
        : null,
    [month, serviceReports, year]
  )

  const handleAction = useCallback(
    async (action: 'copy' | 'hourglass' | 'share') => {
      const otherHoursAsString = () => {
        const otherHours = otherHoursForSpecificMonth(
          serviceReports,
          month || 0,
          year || 0
        )

        if (otherHours.length > 1) {
          return otherHours.reduce(
            (acc, curr, index) => {
              return (
                acc +
                `${curr.tag}: ${curr.hours}${
                  index !== otherHours.length - 1 ? '\n' : ''
                }`
              )
            },
            `\n${i18n.t('otherHoursDescription')}\n`
          )
        }
        return ''
      }

      const reportAsString = () => {
        if (!month || !year) {
          return ''
        }

        const hoursForPublisherOrPioneer = () => {
          if (publisher === 'publisher') {
            if (wentOutForMonth) {
              return i18n.t('yes')
            } else {
              return i18n.t('no')
            }
          }
          return hours
        }

        return `${i18n.t('serviceReport')} - ${moment()
          .month(month)
          .format('MMM')} ${year}\n\n---\n\n${i18n.t(
          'hours'
        )}: ${hoursForPublisherOrPioneer()}\n${i18n.t(
          'studies'
        )}: ${studiesForMonth}\n${i18n.t('notes')}:\n${otherHoursAsString()}`
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
            wentOutForMonth,
            hours
          )}&studies=${studiesForMonth}&remarks=${encodeURI(
            otherHoursAsString()
          )}`

          openURL(hourglassSubmitLink)

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
      hours,
      month,
      publisher,
      serviceReports,
      setSheet,
      studiesForMonth,
      wentOutForMonth,
      year,
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
                  navigation.navigate('Time Reports', {
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
                    .format('MMM, YYYY')}
              </Text>

              <IconButton
                icon={faTimes}
                size='xl'
                onPress={() => setSheet({ open: false, month: 0, year: 0 })}
              />
            </View>
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
