import { useEffect, useRef, useState } from 'react'
import { Linking, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import ActionButton from '@/components/ui/ActionButton'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { isInviteLink } from '@/features/buddies/lib/inviteLink'

const VIEWFINDER_SIZE = 280

/** Scans a buddy's code. Camera access is requested only once this is open. */
export default function BuddyScanPanel({
  onInvite,
}: {
  onInvite: (link: string) => void
}) {
  const theme = useTheme()
  const [permission, requestPermission] = useCameraPermissions()
  const [notInvite, setNotInvite] = useState(false)
  const handled = useRef(false)

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain)
      void requestPermission()
  }, [permission, requestPermission])

  const open = (link: string) => {
    if (handled.current) return
    handled.current = true
    onInvite(link)
  }

  const denied = permission && !permission.granted && !permission.canAskAgain

  return (
    <View style={{ gap: 20 }}>
      {permission?.granted ? (
        <View style={{ alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: VIEWFINDER_SIZE,
              height: VIEWFINDER_SIZE,
              borderRadius: theme.numbers.borderRadiusLg,
              overflow: 'hidden',
              backgroundColor: '#000000',
            }}
          >
            <CameraView
              style={{ flex: 1 }}
              facing='back'
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                if (isInviteLink(data)) open(data)
                else setNotInvite(true)
              }}
            />
          </View>
          <Text
            style={{
              textAlign: 'center',
              color: notInvite ? theme.colors.error : theme.colors.text,
            }}
          >
            {notInvite
              ? i18n.t('buddies_scanNotInvite')
              : i18n.t('buddies_scanHint')}
          </Text>
        </View>
      ) : denied ? (
        <Card style={{ gap: 12 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t('buddies_cameraDeniedTitle')}
          </Text>
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('buddies_cameraDeniedBody')}
          </Text>
          <ActionButton onPress={() => void Linking.openSettings()}>
            {i18n.t('buddies_openSettings')}
          </ActionButton>
        </Card>
      ) : null}
    </View>
  )
}
