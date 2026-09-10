import { Platform, View } from 'react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import i18n from '@/lib/locales'
import {
  usePreferences,
  WidgetAppointmentWindow,
  WidgetContactAction,
  WidgetContactSort,
} from '@/stores/preferences'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'

const contactSortData: { label: string; value: WidgetContactSort }[] = [
  { label: i18n.t('longestContacted'), value: 'longestContacted' },
  { label: i18n.t('recentConversation'), value: 'recentConversation' },
  { label: i18n.t('alphabeticalAsc'), value: 'az' },
  { label: i18n.t('bibleStudy'), value: 'bibleStudy' },
]

const contactActionData: { label: string; value: WidgetContactAction }[] = [
  { label: i18n.t('directions'), value: 'directions' },
  { label: i18n.t('call'), value: 'call' },
  { label: i18n.t('text'), value: 'text' },
  { label: i18n.t('none'), value: 'none' },
]

const appointmentWindowData: {
  label: string
  value: WidgetAppointmentWindow
}[] = [
  { label: i18n.t('today'), value: 'today' },
  { label: i18n.t('next7Days'), value: '7days' },
  { label: i18n.t('next14Days'), value: '14days' },
  { label: i18n.t('next30Days'), value: '30days' },
]

const WidgetsPreferencesSection = () => {
  const {
    widgetContactSort,
    widgetContactAction,
    widgetAppointmentWindow,
    set,
  } = usePreferences()

  if (Platform.OS !== 'ios') return null

  return (
    <View style={{ gap: 20 }}>
      <View>
        <SectionTitle text={i18n.t('contactsWidget')} />
        <Section>
          <InputRowSelect
            label={i18n.t('sortOrder')}
            selectProps={{
              data: contactSortData,
              value: widgetContactSort,
              onChange: ({ value }) => set({ widgetContactSort: value }),
            }}
          />
          <InputRowSelect
            label={i18n.t('quickAction')}
            lastInSection
            selectProps={{
              data: contactActionData,
              value: widgetContactAction,
              onChange: ({ value }) => set({ widgetContactAction: value }),
            }}
          />
        </Section>
      </View>

      <View>
        <SectionTitle text={i18n.t('appointmentsWidget')} />
        <Section>
          <InputRowSelect
            label={i18n.t('timeWindow')}
            lastInSection
            selectProps={{
              data: appointmentWindowData,
              value: widgetAppointmentWindow,
              onChange: ({ value }) => set({ widgetAppointmentWindow: value }),
            }}
          />
        </Section>
      </View>
    </View>
  )
}

export default WidgetsPreferencesSection
