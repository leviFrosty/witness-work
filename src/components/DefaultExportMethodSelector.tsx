import i18n from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import { SelectData } from '@/components/ui/Select'
import { ReportExportMethod, usePreferences } from '@/stores/preferences'

export const exportMethodSelectionOptions: SelectData<ReportExportMethod> = [
  {
    label: i18n.t('copyToClipboard'),
    value: 'copy',
  },
  {
    label: i18n.t('share'),
    value: 'share',
  },
  {
    label: i18n.t('hourglass'),
    value: 'hourglass',
  },
  {
    label: i18n.t('nwPublisher'),
    value: 'nwpublisher',
  },
]

const DefaultExportMethodSelector = ({
  lastInSection,
  description,
  source = 'preferences',
}: {
  lastInSection?: boolean
  description?: string
  /** Where the change happened, for analytics. */
  source?: 'preferences' | 'report_screen'
}) => {
  const { defaultExportMethod, set } = usePreferences()

  return (
    <InputRowSelect
      selectProps={{
        data: exportMethodSelectionOptions,
        onChange: ({ value }) => {
          analytics.capture('submission_method_changed', {
            method: value,
            previous_method: defaultExportMethod,
            source,
          })
          set({ defaultExportMethod: value })
        },
        value: defaultExportMethod,
      }}
      label={i18n.t('defaultExportMethod')}
      description={description}
      lastInSection={lastInSection}
    />
  )
}
export default DefaultExportMethodSelector
