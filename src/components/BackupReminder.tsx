import { View } from 'react-native'
import useTheme from '../contexts/theme'
import Text from './MyText'
import i18n from '../lib/locales'
import Button from './Button'
import { usePreferences } from '../stores/preferences'
import XView from './layout/XView'
import IconButton from './IconButton'
import { faTimes, faWarning } from '@fortawesome/free-solid-svg-icons'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../types/rootStack'

const BackupReminder = () => {
  const theme = useTheme()
  const { backupNotificationFrequencyAsDays, set } = usePreferences()
  const navigation = useNavigation<RootStackNavigation>()

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
          <IconButton icon={faWarning} color={theme.colors.error} />
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
          icon={faTimes}
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
