import { BookOpen as BookOpenIcon } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import Avatar, { isRenderableImageValue } from '@/components/ui/Avatar'
import Copyeable from '@/components/ui/Copyeable'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { withAlpha } from '@/lib/color'
import { formatMonthDayCompact } from '@/lib/dates'
import i18n from '@/lib/locales'
import ContactAvatarViewer from '@/features/contacts/components/ContactAvatarViewer'
import GenderIcon from '@/features/contacts/components/GenderIcon'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'
import moment from 'moment'

type Props = {
  contact: Contact
  heroBackground: string
  heroForeground: string
  /** Extra room at the bottom so the Up Next card can overlap the hero. */
  overlapped: boolean
  isActiveStudy: boolean
  mostRecentStudy: Visit | null
}

/** Compact identity row on the contact's hero tint. */
const ContactHero = ({
  contact,
  heroBackground,
  heroForeground,
  overlapped,
  isActiveStudy,
  mostRecentStudy,
}: Props) => {
  const theme = useTheme()
  const [viewerOpen, setViewerOpen] = useState(false)
  const avatar = contact.avatar ?? { type: 'none' as const, value: '' }
  // Image avatars open the full-screen viewer; emoji and initials keep the
  // morph-to-center animation. iCloud markers aren't renderable yet.
  const isImageAvatar =
    avatar.type === 'image' && isRenderableImageValue(avatar.value)
  const avatarNode = (
    <Avatar
      avatar={avatar}
      name={contact.name}
      size={58}
      focusable={!isImageAvatar}
      background={contact.avatarBackground ?? undefined}
    />
  )

  const studyDate = mostRecentStudy
    ? formatMonthDayCompact(moment(mostRecentStudy.date))
    : null

  return (
    <View
      style={{
        backgroundColor: heroBackground,
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: overlapped ? 54 : 24,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <View
        style={{
          borderRadius: 32,
          borderWidth: 3,
          borderColor: withAlpha(heroForeground, 0x99),
        }}
      >
        {isImageAvatar ? (
          <Pressable
            onPress={() => setViewerOpen(true)}
            accessibilityRole='imagebutton'
            accessibilityLabel={i18n.t('profilePicture')}
            hitSlop={4}
          >
            {avatarNode}
          </Pressable>
        ) : (
          avatarNode
        )}
      </View>
      {isImageAvatar && (
        <ContactAvatarViewer
          visible={viewerOpen}
          contact={contact}
          onClose={() => setViewerOpen(false)}
        />
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Copyeable
            style={{ flexShrink: 1 }}
            textProps={{
              numberOfLines: 3,
              style: {
                fontSize: 24,
                lineHeight: 28,
                fontFamily: theme.fonts.bold,
                color: heroForeground,
              },
            }}
          >
            {contact.name}
          </Copyeable>
          {contact.gender && (
            <GenderIcon
              gender={contact.gender}
              size={16}
              color={heroForeground}
              opacity={0.7}
            />
          )}
        </View>
        {studyDate && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <LucideIcon icon={BookOpenIcon} size={13} color={heroForeground} />
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: heroForeground,
                opacity: 0.94,
                flexShrink: 1,
              }}
            >
              {isActiveStudy
                ? i18n.t('contactDetails.studyingSince', { date: studyDate })
                : i18n.t('contactDetails.lastStudy', { date: studyDate })}
            </Text>
            <InfoPopover
              inline
              color={heroForeground}
              title={i18n.t('contactDetails.studyRuleTitle')}
              description={i18n.t(
                'inactiveBibleStudiesDoNoCountTowardsMonthlyTotals'
              )}
            />
          </View>
        )}
      </View>
    </View>
  )
}

export default ContactHero
