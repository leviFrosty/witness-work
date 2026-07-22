import {
  ExternalLink as ExternalLinkIcon,
  ShieldHalf as ShieldHalfIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import links from '@/constants/links'
import useTheme from '@/contexts/theme'
import { openURL } from '@/lib/links'
import i18n from '@/lib/locales'

/** One concrete data-handling statement with a primary-source policy link. */
const NotesImportDataHandling = () => {
  const theme = useTheme()

  return (
    <View
      style={{
        gap: 10,
        paddingTop: 24,
        borderTopWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: theme.colors.backgroundLighter,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LucideIcon
            icon={ShieldHalfIcon}
            size={13}
            color={theme.colors.textAlt}
          />
        </View>
        <Text
          style={{
            flex: 1,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('lg'),
          }}
        >
          {i18n.t('notesImport_privacyTitle')}
        </Text>
      </View>
      <Text
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('md'),
          lineHeight: 21,
        }}
      >
        {i18n.t('notesImport_privacySummary')}
      </Text>
      <Button
        noTransform
        accessibilityRole='link'
        accessibilityLabel={i18n.t('notesImport_privacyLink')}
        onPress={() => openURL(links.openRouterZdr)}
        style={{
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Text
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('md'),
          }}
        >
          {i18n.t('notesImport_privacyLink')}
        </Text>
        <LucideIcon
          icon={ExternalLinkIcon}
          size={10}
          color={theme.colors.accent}
        />
      </Button>
    </View>
  )
}

export default NotesImportDataHandling
