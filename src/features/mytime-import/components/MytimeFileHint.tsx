import { Info as InfoIcon } from 'lucide-react-native'
import { Platform } from 'react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

const MytimeFileHint = () => {
  const theme = useTheme()
  return (
    <XView style={{ alignItems: 'flex-start', gap: 10 }}>
      <LucideIcon
        icon={InfoIcon}
        size={16}
        color={theme.colors.textAlt}
        style={{ marginTop: 2 }}
      />
      <Text
        style={{
          flex: 1,
          fontSize: theme.fontSize('sm'),
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t(
          Platform.OS === 'android'
            ? 'mytimeImport_fileHintAndroid'
            : 'mytimeImport_fileHint'
        )}
      </Text>
    </XView>
  )
}

export default MytimeFileHint
