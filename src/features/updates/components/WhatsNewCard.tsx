import {
  ChevronRight as ChevronRightIcon,
  Tag as TagIcon,
  X as XIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import moment from 'moment'
import Constants from 'expo-constants'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import Button from '@/components/ui/Button'
import XView from '@/components/ui/layout/XView'
import IconButton from '@/components/ui/IconButton'
import { usePreferences } from '@/stores/preferences'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '@/types/rootStack'

/** How long the card lingers on Home before the Settings dot is the only cue. */
const CARD_VISIBLE_DAYS = 7

/**
 * Slim, one-line Home card announcing a passively announced release. Tapping
 * opens What's New (which clears the unread state); the ✕ hides only the card
 * and leaves the Settings row dot until the notes are read.
 */
const WhatsNewCard = () => {
  const theme = useTheme()
  const { unreadReleaseNotes, set } = usePreferences()
  const navigation = useNavigation<RootStackNavigation>()

  if (
    !unreadReleaseNotes ||
    unreadReleaseNotes.cardDismissed ||
    moment(unreadReleaseNotes.at)
      .add(CARD_VISIBLE_DAYS, 'days')
      .isBefore(moment())
  ) {
    return null
  }

  return (
    <Button
      onPress={() => navigation.navigate('Whats New')}
      style={{
        backgroundColor: theme.colors.accentTranslucent,
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
          icon={TagIcon}
          color={theme.colors.accent}
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
          {i18n.t('whatsNewCard_title', {
            version: Constants.expoConfig?.version ?? '',
          })}
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.accent,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {` ${i18n.t('whatsNewCard_cta')}`}
          </Text>
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
          onPress={() =>
            set({
              unreadReleaseNotes: {
                ...unreadReleaseNotes,
                cardDismissed: true,
              },
            })
          }
        />
      </XView>
    </Button>
  )
}

export default WhatsNewCard
