import { useEffect, useState } from 'react'
import { AppState, View } from 'react-native'
import { ChevronRight, Megaphone, X } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { _i18n } from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { announcementContent } from '@/features/announcements/lib/announcement'
import { announcementClient } from '@/features/announcements/lib/announcementRuntime'
import AnnouncementSheet from '@/features/announcements/components/AnnouncementSheet'

export default function AnnouncementBanner() {
  const theme = useTheme()
  const locale = usePreferences((state) => state.locale)
  const [announcement, setAnnouncement] = useState(
    announcementClient.getLaunchAnnouncement
  )
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!announcement) return
    // Removal is allowed when cached information ages out. A foreground event
    // never introduces a new item or makes another network request.
    const check = () => {
      if (!announcementClient.getLaunchAnnouncement()) {
        setOpen(false)
        setAnnouncement(null)
      }
    }
    const timer = setInterval(check, 60_000)
    const subscription = AppState.addEventListener('change', check)
    return () => {
      clearInterval(timer)
      subscription.remove()
    }
  }, [announcement])

  if (!announcement) return null
  const content = announcementContent(announcement, locale ?? _i18n.locale)

  return (
    <>
      <Card
        style={{ paddingVertical: 0, paddingHorizontal: 12, gap: 8 }}
        flexDirection='row'
      >
        <Button
          noTransform
          accessibilityRole='button'
          accessibilityLabel={content.bannerText}
          onPress={() => setOpen(true)}
          hitSlop={0}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            minHeight: 52,
            paddingVertical: 12,
          }}
        >
          <Megaphone size={18} color={theme.colors.accent} accessible={false} />
          <Text
            style={{
              flex: 1,
              fontSize: theme.fontSize('sm'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {content.bannerText}
          </Text>
          <ChevronRight
            size={16}
            color={theme.colors.textAlt}
            accessible={false}
          />
        </Button>
        {announcement.dismissible && (
          <View style={{ justifyContent: 'center' }}>
            <IconButton
              noTransform
              icon={X}
              size={18}
              hitSlop={0}
              style={{
                minWidth: 44,
                minHeight: 44,
                justifyContent: 'center',
                alignItems: 'center',
              }}
              accessibilityLabel={i18n.t('dismiss')}
              onPress={() => {
                announcementClient.dismiss(announcement.id)
                setOpen(false)
                setAnnouncement(null)
              }}
            />
          </View>
        )}
      </Card>
      {open && (
        <AnnouncementSheet
          announcement={announcement}
          content={content}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
