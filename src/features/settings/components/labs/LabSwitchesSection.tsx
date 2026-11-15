import { FlaskConical as FlaskConicalIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import {
  GroupedListSection,
  GroupedListSwitchRow,
} from '@/components/ui/GroupedList'
import { analytics } from '@/lib/analytics'
import {
  labDefinition,
  labIds,
  setLab,
  useLabsStore,
  resolveLab,
} from '@/lib/labs'

const LabSwitchesSection = () => {
  const choices = useLabsStore((state) => state.choices)
  const ids = labIds()
  if (ids.length === 0) return null

  return (
    <GroupedListSection footer={i18n.t('labs_footer')}>
      {ids.map((id) => {
        const lab = labDefinition(id)
        return (
          <GroupedListSwitchRow
            key={id}
            testID={`settings-lab-${id}`}
            icon={lab.icon ?? FlaskConicalIcon}
            label={i18n.t(lab.title)}
            info={i18n.t(lab.description)}
            value={resolveLab(choices, id)}
            onValueChange={(on) => {
              setLab(id, on)
              analytics.capture('lab_toggled', { lab: id, enabled: on })
            }}
          />
        )
      })}
    </GroupedListSection>
  )
}

export default LabSwitchesSection
