import {
  Gauge as GaugeIcon,
  NotebookPen as NotebookPenIcon,
} from 'lucide-react-native'
import i18n from '@/lib/locales'
import { GroupedListRow, GroupedListSection } from '@/components/ui/GroupedList'
import { SettingsSectionProps } from '@/features/settings/screens/settingScreen'
import {
  useScribeAvailability,
  useScribeEnabled,
  useScribeMemoryEnabled,
  useScribeUsage,
} from '@/features/scribe'
import {
  blockedStatusCopy,
  fullestWindow,
} from '@/features/scribe/components/scribeCopy'

/**
 * Scribe AI's usage and memory, shown only where Scribe AI is on. The section
 * names Scribe AI, so its rows don't repeat it.
 */
const ScribeSection = ({
  handleNavigate,
  selectedDestination,
}: SettingsSectionProps) => {
  const scribeEnabled = useScribeEnabled()
  const scribe = useScribeAvailability()
  // Shown in passing: never opens a session (and an account) to fill it in.
  const fullest = fullestWindow(useScribeUsage({ open: false }).usage)
  const memoryEnabled = useScribeMemoryEnabled()
  if (!scribeEnabled) return null
  return (
    <GroupedListSection title={i18n.t('scribe_name')}>
      <GroupedListRow
        icon={GaugeIcon}
        label={i18n.t('scribe_usageRow')}
        sublabel={
          scribe.status === 'offline'
            ? i18n.t('scribe_offlineBadge')
            : scribe.status === 'blocked'
              ? i18n.t(blockedStatusCopy(scribe.reason))
              : fullest
                ? i18n.t('scribe_usagePercent', {
                    percent: fullest.percentUsed,
                  })
                : undefined
        }
        onPress={() => handleNavigate('ScribeUsage')}
        selected={selectedDestination === 'ScribeUsage'}
      />
      <GroupedListRow
        icon={NotebookPenIcon}
        label={i18n.t('scribe_memoryRow')}
        sublabel={memoryEnabled ? undefined : i18n.t('scribe_memoryOff')}
        onPress={() => handleNavigate('ScribeMemory')}
        selected={selectedDestination === 'ScribeMemory'}
      />
    </GroupedListSection>
  )
}

export default ScribeSection
