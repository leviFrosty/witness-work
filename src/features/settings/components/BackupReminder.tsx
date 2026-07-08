import {
  ChevronRight as ChevronRightIcon,
  TriangleAlert as TriangleAlertIcon,
  X as XIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import Button from '@/components/ui/Button'
import { usePreferences } from '@/stores/preferences'
import XView from '@/components/ui/layout/XView'
import IconButton from '@/components/ui/IconButton'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '@/types/rootStack'

type Props = {
  /**
   * Slim, deprioritized one-line bar instead of the full warning card. Used
   * when the user already has iCloud sync turned on — their data is being
   * backed up continuously, so the local-export nag should be present but not
   * shouty.
   */
  compact?: boolean
}

const BackupReminder = ({ compact }: Props) => {
  const theme = useTheme()
  const { backupNotificationFrequencyAsDays, set } = usePreferences()
  const navigation = useNavigation<RootStackNavigation>()

  if (compact) {
    return (
      <Button
        onPress={() => navigation.navigate('Import and Export')}
        style={{
          backgroundColor: theme.colors.warnTranslucent,
          borderColor: theme.colors.warn,
          borderWidth: 1,
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: theme.numbers.borderRadiusMd,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <XView style={{ gap: 8, flex: 1 }}>
          <LucideIcon
            icon={TriangleAlertIcon}
            color={theme.colors.warn}
            size={theme.fontSize('xs')}
          />
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.text,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {i18n.t('recommendedBackup')}
          </Text>
        </XView>
        <XView style={{ gap: 4 }}>
          <LucideIcon
            icon={ChevronRightIcon}
            color={theme.colors.textAlt}
            size={theme.fontSize('xs')}
          />
          <IconButton
            icon={XIcon}
            color={theme.colors.textAlt}
            size='xs'
            onPress={() => set({ lastBackupDate: new Date() })}
          />
        </XView>
      </Button>
    )
  }

  return (
    <View
      style={{
        backgroundColor: theme.colors.errorTranslucent,
        borderColor: theme.colors.error,
        borderWidth: 1,
        padding: 20,
        borderRadius: theme.numbers.borderRadiusLg,
        gap: 10,
      }}
    >
      <XView style={{ justifyContent: 'space-between' }}>
        <XView>
          <IconButton icon={TriangleAlertIcon} color={theme.colors.error} />
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.error,
            }}
          >
            {i18n.t('recommendedBackup')}
          </Text>
        </XView>
        <IconButton
          icon={XIcon}
          color={theme.colors.text}
          onPress={() => set({ lastBackupDate: new Date() })}
        />
      </XView>
      <Text>
        {i18n.t('recommendedBackup_description', {
          count: backupNotificationFrequencyAsDays,
        })}
      </Text>
      <Button onPress={() => navigation.navigate('Import and Export')}>
        <Text
          style={{
            textDecorationLine: 'underline',
            fontFamily: theme.fonts.bold,
          }}
        >
          {i18n.t('backupNow')}
        </Text>
      </Button>
    </View>
  )
}

export default BackupReminder
