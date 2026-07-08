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
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        paddingTop: 18,
        borderTopWidth: 1,
        borderColor: theme.colors.border,
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
      <View style={{ flex: 1, gap: 7 }}>
        <Text style={{ fontFamily: theme.fonts.semiBold }}>
          {i18n.t('notesImport_privacyTitle')}
        </Text>
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
            lineHeight: 19,
          }}
        >
          {i18n.t('notesImport_privacySummary')}
        </Text>
        <Button
          noTransform
          accessibilityRole='link'
          accessibilityLabel={i18n.t('notesImport_privacyLink')}
          onPress={() => openURL(links.openRouterZdr)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <Text
            style={{
              color: theme.colors.accent,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
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
    </View>
  )
}

export default NotesImportDataHandling
