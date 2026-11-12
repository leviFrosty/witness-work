import { useEffect, useRef } from 'react'
import { View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { openAppSettings } from '@/lib/openAppSettings'

const VIEWFINDER_SIZE = 240

export default function TerritoryLinkScanner({
  onRead,
}: {
  onRead: (data: string) => void
}) {
  const theme = useTheme()
  const [permission, requestPermission] = useCameraPermissions()
  const handled = useRef(false)

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain)
      void requestPermission()
  }, [permission, requestPermission])

  const denied = permission && !permission.granted && !permission.canAskAgain

  return (
    <View
      style={{ alignItems: 'center', gap: 12, padding: 16 }}
      testID='territory-link-scanner'
    >
      {permission?.granted && (
        <View
          style={{
            width: VIEWFINDER_SIZE,
            height: VIEWFINDER_SIZE,
            borderRadius: 14,
            overflow: 'hidden',
            backgroundColor: '#000000',
          }}
        >
          <CameraView
            style={{ flex: 1 }}
            facing='back'
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (handled.current) return
              handled.current = true
              onRead(data)
            }}
          />
        </View>
      )}
      <Text
        accessibilityLiveRegion='polite'
        style={{ textAlign: 'center', color: theme.colors.textAlt }}
      >
        {i18n.t(
          denied ? 'territories.scanCameraDenied' : 'territories.scanHint'
        )}
      </Text>
      {denied && (
        <Button
          variant='outline'
          onPress={() => void openAppSettings()}
          style={{ paddingHorizontal: 16, paddingVertical: 10, minHeight: 44 }}
        >
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t('buddies_openSettings')}
          </Text>
        </Button>
      )}
    </View>
  )
}
