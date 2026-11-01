import {
  Gauge as GaugeIcon,
  MessageSquareText as MessageSquareTextIcon,
  NotebookPen as NotebookPenIcon,
  ShieldCheck as ShieldCheckIcon,
} from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import i18n from '@/lib/locales'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import {
  GroupedListRow,
  GroupedListSection,
  GroupedListSwitchRow,
} from '@/components/ui/GroupedList'
import { SettingsSectionProps } from '@/features/settings/screens/settingScreen'
import { usePreferences } from '@/stores/preferences'
import { useScribeOffered } from '@/hooks/useScribeEnabled'
import {
  useScribeAvailability,
  useScribeMemoryEnabled,
  useScribeUsage,
} from '@/features/scribe'
import {
  blockedStatusCopy,
  fullestWindow,
} from '@/features/scribe/components/scribeCopy'
import { trackScribeTurnedOnOff } from '@/features/scribe/analytics'
import { pendingScribeConsent } from '@/features/scribe/stores/consent'
import type { RootStackNavigation } from '@/types/rootStack'

const ScribeSection = ({
  handleNavigate,
  selectedDestination,
  onZeroDataRetention,
}: SettingsSectionProps & { onZeroDataRetention: () => void }) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const offered = useScribeOffered()
  const turnedOn = usePreferences((s) => s.scribeAiEnabled)
  const setPreferences = usePreferences((s) => s.set)
  const scribe = useScribeAvailability()

  const fullest = fullestWindow(useScribeUsage({ open: false }).usage)
  const memoryEnabled = useScribeMemoryEnabled()
  if (!offered) return null
  return (
    <GroupedListSection
      title={i18n.t('scribe_name')}
      footer={turnedOn ? undefined : i18n.t('scribe_turnedOffFooter')}
    >
      <GroupedListSwitchRow
        icon={MessageSquareTextIcon}
        label={i18n.t('scribe_enabledToggle')}
        value={turnedOn}
        onValueChange={(value) => {
          if (value && pendingScribeConsent().terms)
            return navigation.navigate('ScribeConsent', { mode: 'enable' })
          setPreferences({ scribeAiEnabled: value })
          trackScribeTurnedOnOff(value)
        }}
      />
      {}
      {turnedOn && (
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
      )}
      {turnedOn && (
        <GroupedListRow
          icon={NotebookPenIcon}
          label={i18n.t('scribe_memoryRow')}
          sublabel={memoryEnabled ? undefined : i18n.t('scribe_memoryOff')}
          onPress={() => handleNavigate('ScribeMemory')}
          selected={selectedDestination === 'ScribeMemory'}
        />
      )}
      {turnedOn && (
        <GroupedListRow
          icon={ShieldCheckIcon}
          label={i18n.t('scribe_zdrRow')}
          onPress={onZeroDataRetention}
          accessory='none'
          trailing={
            <Text
              style={{
                fontSize: theme.fontSize('md'),
                color: theme.colors.accent,
              }}
            >
              {i18n.t('scribe_zdrLearnMore')}
            </Text>
          }
        />
      )}
    </GroupedListSection>
  )
}

export default ScribeSection
