import i18n from '@/lib/locales'
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
}: {
  lastInSection?: boolean
}) => {
  const { defaultExportMethod, set } = usePreferences()

  return (
    <InputRowSelect
      selectProps={{
        data: exportMethodSelectionOptions,
        onChange: ({ value }) => set({ defaultExportMethod: value }),
        value: defaultExportMethod,
      }}
      label={i18n.t('defaultExportMethod')}
      lastInSection={lastInSection}
    />
  )
}
export default DefaultExportMethodSelector
