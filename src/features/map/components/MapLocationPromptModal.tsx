import {
  LocateFixed as LocateFixedIcon,
  ShieldCheck as ShieldCheckIcon,
  X as XIcon,
} from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'
import * as Location from 'expo-location'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Sheet from '@/components/ui/Sheet'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'

type Props = {
  open: boolean
  onDismiss: () => void
  onResult: (granted: boolean) => void
}

export default function MapLocationPromptModal({
  open,
  onDismiss,
  onResult,
}: Props) {
  const theme = useTheme()
  const [requesting, setRequesting] = useState(false)

  const handleDismiss = () => {
    if (requesting) return
    usePreferences.getState().set({
      mapLocationPromptSeen: true,
      hasCompletedMapOnboarding: true,
    })
    onDismiss()
  }

  const handleAllow = async () => {
    if (requesting) return
    setRequesting(true)
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync()
      analytics.capture('map_location_permission_result', { granted })
      usePreferences.getState().set({
        mapLocationPromptSeen: true,
        hasCompletedMapOnboarding: true,
        placeSearchLocationAsked: true,
      })
      onResult(granted)
    } finally {
      setRequesting(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleDismiss()
      }}
      dismissible={!requesting}
      accessibilityLabel={i18n.t('mapLocation_title')}
      testID='map-location-prompt'
    >
      <Sheet.ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 16, gap: 18 }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: theme.colors.accentTranslucent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LucideIcon
              icon={LocateFixedIcon}
              size={22}
              color={theme.colors.accent}
            />
          </View>
          <IconButton
            frame
            noTransform
            icon={XIcon}
            onPress={handleDismiss}
            accessibilityLabel={i18n.t('close')}
            testID='map-location-prompt-close'
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text
            style={{
              fontSize: theme.fontSize('xl'),
              fontFamily: theme.fonts.bold,
              color: theme.colors.text,
            }}
          >
            {i18n.t('mapLocation_title')}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('md'),
              color: theme.colors.textAlt,
              lineHeight: theme.fontSize('md') * 1.45,
            }}
          >
            {i18n.t('mapLocation_subtitle')}
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: theme.numbers.borderRadiusMd,
            borderCurve: 'continuous',
            backgroundColor: theme.colors.backgroundLighter,
          }}
        >
          <LucideIcon
            icon={ShieldCheckIcon}
            size={18}
            color={theme.colors.accent}
          />
          <Text
            style={{
              flex: 1,
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              lineHeight: theme.fontSize('sm') * 1.4,
            }}
          >
            {i18n.t('mapLocation_privateDesc')}
          </Text>
        </View>

        <View style={{ gap: 8, marginTop: 4 }}>
          <ActionButton
            testID='map-location-prompt-allow'
            disabled={requesting}
            loading={requesting}
            onPress={handleAllow}
          >
            {i18n.t('enableLocationServices')}
          </ActionButton>
          <Button
            testID='map-location-prompt-dismiss'
            disabled={requesting}
            onPress={handleDismiss}
            style={{
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                textAlign: 'center',
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('notNow')}
            </Text>
          </Button>
        </View>
      </Sheet.ScrollView>
    </Sheet>
  )
}
