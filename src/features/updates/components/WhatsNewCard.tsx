import {
  ChevronRight as ChevronRightIcon,
  Tag as TagIcon,
  X as XIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import moment from 'moment'
import Constants from 'expo-constants'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import XView from '@/components/ui/layout/XView'
import IconButton from '@/components/ui/IconButton'
import ContextMenu from '@/components/ui/ContextMenu'
import { usePreferences } from '@/stores/preferences'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '@/types/rootStack'

/** How long the card lingers on Home before the Settings dot is the only cue. */
const CARD_VISIBLE_DAYS = 7

/**
 * Slim, one-line Home card announcing a passively announced release. Tapping
 * opens What's New (which clears the unread state); the ✕ hides only the card
 * and leaves the Settings row dot until the notes are read. Long-press offers
 * the same two actions.
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

  const open = () => navigation.navigate('Whats New')
  const dismiss = () =>
    set({ unreadReleaseNotes: { ...unreadReleaseNotes, cardDismissed: true } })
  const iconSize = theme.fontSize('xs')
  const title = i18n.t('whatsNewCard_title', {
    version: Constants.expoConfig?.version ?? '',
  })

  return (
    <View>
      <ContextMenu
        analyticsSurface='whats_new_card'
        onPress={open}
        accessibilityLabel={`${title} ${i18n.t('whatsNewCard_cta')}`}
        actions={[
          [
            {
              id: 'open',
              title: i18n.t('seeWhatsNewAction'),
              systemImage: 'tag',
              onPress: open,
            },
          ],
          [
            {
              id: 'dismiss',
              title: i18n.t('dismiss'),
              systemImage: 'xmark',
              onPress: dismiss,
            },
          ],
        ]}
      >
        <XView
          style={{
            backgroundColor: theme.colors.accentTranslucent,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: theme.numbers.borderRadiusMd,
            gap: 8,
          }}
        >
          <LucideIcon
            icon={TagIcon}
            color={theme.colors.accent}
            size={iconSize}
          />
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.text,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {title}
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
          <XView style={{ gap: 4 }}>
            <LucideIcon
              icon={ChevronRightIcon}
              color={theme.colors.textAlt}
              size={iconSize}
            />
            {/* Room for the ✕, which sits outside the long-press target. */}
            <View style={{ width: iconSize }} />
          </XView>
        </XView>
      </ContextMenu>
      <View
        pointerEvents='box-none'
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 12,
          justifyContent: 'center',
        }}
      >
        <IconButton
          icon={XIcon}
          color={theme.colors.textAlt}
          size='xs'
          accessibilityLabel={i18n.t('dismiss')}
          onPress={dismiss}
        />
      </View>
    </View>
  )
}

export default WhatsNewCard
