import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import Wrapper from '@/components/ui/layout/Wrapper'
import ActionButton from '@/components/ui/ActionButton'
import SegmentedControl from '@/components/ui/SegmentedControl'
import Text from '@/components/ui/MyText'
import StoreQrCode from '@/components/StoreQrCode'
import links from '@/constants/links'
import useTheme from '@/contexts/theme'
import useFullBrightness from '@/hooks/useFullBrightness'
import i18n from '@/lib/locales'
import { shareApp } from '@/lib/shareApp'

const QR_SIZE = 220

type Store = 'android' | 'ios'

/**
 * A code a friend can scan to find WitnessWork in their phone's store — Google
 * Play first, since the app is newly back on Android — and a link to share for
 * anyone who isn't standing beside you.
 */
const ShareAppScreen = () => {
  const theme = useTheme()
  const [store, setStore] = useState<Store>('android')
  useFullBrightness()

  return (
    <Wrapper insets='bottom'>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingVertical: 30,
          gap: 24,
          alignItems: 'center',
        }}
      >
        <SegmentedControl
          variant='pill'
          style={{ alignSelf: 'stretch' }}
          options={[
            { key: 'android', label: i18n.t('shareApp_android') },
            { key: 'ios', label: i18n.t('shareApp_iphone') },
          ]}
          value={store}
          onChange={setStore}
        />
        <View
          style={{
            padding: 20,
            gap: 12,
            alignItems: 'center',
            borderRadius: 24,
            borderCurve: 'continuous',
            backgroundColor: '#FFFFFF',
            shadowColor: theme.colors.shadow,
            shadowOpacity: theme.numbers.shadowOpacity,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 4,
          }}
        >
          <StoreQrCode
            url={store === 'android' ? links.playStore : links.appStore}
            size={QR_SIZE}
            accessibilityLabel={i18n.t(
              store === 'android' ? 'shareApp_qrAndroid' : 'shareApp_qrIos'
            )}
          />
          <Text
            style={{
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('md'),
              color: '#000000',
            }}
          >
            {i18n.t(
              store === 'android' ? 'shareApp_googlePlay' : 'shareApp_appStore'
            )}
          </Text>
        </View>
        <Text
          style={{
            textAlign: 'center',
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('shareApp_scanHint')}
        </Text>
        <View style={{ alignSelf: 'stretch' }}>
          <ActionButton onPress={() => shareApp('settings')}>
            {i18n.t('updateReveal_shareLink')}
          </ActionButton>
        </View>
      </ScrollView>
    </Wrapper>
  )
}

export default ShareAppScreen
