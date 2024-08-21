import { Sheet } from 'tamagui'
import Text from './MyText'
import i18n, { TranslationKey } from '../lib/locales'
import useTheme from '../contexts/theme'
import {
  getTagName,
  ServiceReportTag,
  usePreferences,
} from '../stores/preferences'
import useServiceReport from '../stores/serviceReport'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Switch, View } from 'react-native'
import XView from './layout/XView'
import CreditBadge from './CreditBadge'
import Badge from './Badge'
import ActionButton from './ActionButton'
import Divider from './Divider'
import Card from './Card'
import { getMonthsReports } from '../lib/serviceReport'

type UpgradeLegacyTimeReportsTagsSheetProps = {
  sheet: boolean
  setSheet: React.Dispatch<React.SetStateAction<boolean>>
}

const TagUpdateRow = ({
  tag,
  updateExistingServiceReportsTags,
}: {
  tag: string | ServiceReportTag
  lastInSection?: boolean
  updateExistingServiceReportsTags: (tag: ServiceReportTag) => void
}) => {
  const theme = useTheme()
  const { serviceReportTags, set: setPreferencesStore } = usePreferences()

  const setCredit = (reportTag: string | ServiceReportTag, credit: boolean) => {
    // Updates according tag to be credit / or not in preferences
    const tags: (string | ServiceReportTag)[] = [...serviceReportTags].map(
      (t) => {
        const newTag = getTagName(tag)
        const existing = getTagName(t)

        if (existing === newTag) {
          return {
            value: existing,
            credit,
          }
        }
        return t
      }
    )

    updateExistingServiceReportsTags({ credit, value: getTagName(reportTag) })
    setPreferencesStore({ serviceReportTags: tags })
  }

  return (
    <XView style={{ justifyContent: 'space-between', flex: 1 }}>
      <XView>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t(getTagName(tag) as TranslationKey, {
            defaultValue: getTagName(tag),
          })}
        </Text>
        {(tag === 'ldc' || (typeof tag === 'object' && tag.credit)) && (
          <CreditBadge />
        )}
      </XView>

      <Switch
        value={tag === 'ldc' || (typeof tag === 'object' && tag.credit)}
        onValueChange={(val) => setCredit(tag, val)}
        disabled={tag === 'ldc' || tag === 'standard'}
      />
    </XView>
  )
}

export default function UpgradeLegacyTimeReportsSheet({
  sheet,
  setSheet,
}: UpgradeLegacyTimeReportsTagsSheetProps) {
  const theme = useTheme()
  const { serviceReportTags, set: setPreferencesStore } = usePreferences()

  const insets = useSafeAreaInsets()
  const updateRemainingLegacyTags = () => {
    const tags = [...serviceReportTags].map((t) => {
      if (typeof t === 'string') {
        updateExistingServiceReportsTags({
          credit: false,
          value: t,
        })
        return {
          value: t,
          credit: false,
        }
      }
      return t
    })
    setPreferencesStore({ serviceReportTags: tags })
  }

  const { set: setServiceReportStore, serviceReports } = useServiceReport()

  const updateExistingServiceReportsTags = (tag: ServiceReportTag) => {
    const reports = { ...serviceReports }
    for (const year in reports) {
      for (const month in reports[year]) {
        const monthReports = getMonthsReports(
          reports,
          parseInt(month),
          parseInt(year)
        )
        const reportsWithUpdatedCreditTag = monthReports.map((r) => {
          if (r.tag === tag.value) {
            return {
              ...r,
              credit: tag.credit,
            }
          }
          return r
        })
        reports[year][month] = reportsWithUpdatedCreditTag
      }
    }

    setServiceReportStore({ serviceReports: reports })
  }

  return (
    <Sheet
      open={sheet}
      onOpenChange={(o: boolean) => setSheet(o)}
      dismissOnSnapToBottom
      modal
      dismissOnOverlayPress={false}
      disableDrag
    >
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        <View style={{ padding: 30, gap: 8 }}>
          <XView>
            <Text
              style={{
                fontFamily: theme.fonts.bold,
                fontSize: theme.fontSize('3xl'),
              }}
            >
              {i18n.t('credits')}
            </Text>
            <Badge color={theme.colors.accent}>
              <Text style={{ color: theme.colors.textInverse }}>
                {i18n.t('new')}
              </Text>
            </Badge>
          </XView>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('witnessWorkNowSupportsCredits')}
          </Text>
        </View>
        <Sheet.ScrollView
          contentContainerStyle={{
            paddingBottom: insets.bottom,
            paddingHorizontal: 30,
          }}
        >
          <Card>
            <View style={{ gap: 8 }}>
              <XView style={{ justifyContent: 'space-between' }}>
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.textAlt,
                  }}
                >
                  {i18n.t('type')}
                </Text>
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.textAlt,
                  }}
                >
                  {i18n.t('credit')}
                </Text>
              </XView>
              <Divider />
            </View>
            <View style={{ gap: 15 }}>
              <TagUpdateRow
                tag={'standard'}
                updateExistingServiceReportsTags={
                  updateExistingServiceReportsTags
                }
              />
              <TagUpdateRow
                tag={'ldc'}
                updateExistingServiceReportsTags={
                  updateExistingServiceReportsTags
                }
              />
              {serviceReportTags.map((tag, index) => {
                return (
                  <TagUpdateRow
                    key={index}
                    tag={tag}
                    updateExistingServiceReportsTags={
                      updateExistingServiceReportsTags
                    }
                    lastInSection={serviceReportTags.length - 1 === index}
                  />
                )
              })}
            </View>
          </Card>
        </Sheet.ScrollView>
        <View
          style={{
            paddingBottom: insets.bottom + 10,
            paddingHorizontal: 30,
          }}
        >
          <ActionButton
            onPress={() => {
              updateRemainingLegacyTags()
              setSheet(false)
            }}
          >
            {i18n.t('done')}
          </ActionButton>
        </View>
      </Sheet.Frame>
    </Sheet>
  )
}
