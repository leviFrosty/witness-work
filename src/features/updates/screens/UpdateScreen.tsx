import { View, ScrollView } from 'react-native'
import LottieView from 'lottie-react-native'
import Text from '@/components/ui/MyText'
import { useEffect, useRef, useState } from 'react'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import * as Updates from 'expo-updates'
import { errorTracking } from '@/lib/errorTracking'
import { isConnectivityError } from '@/lib/http/networkError'
import ActionButton from '@/components/ui/ActionButton'
import { useNavigation } from '@react-navigation/native'
import Wrapper from '@/components/ui/layout/Wrapper'
import Button from '@/components/ui/Button'
import Loader from '@/components/ui/Loader'
import { RootStackNavigation } from '@/types/rootStack'

type UpdateError = { offline: boolean; cause: unknown }

/**
 * Downloads the update `fetchUpdate` already found, then restarts into it.
 * Leaving the screen stops the restart; a finished download still applies on
 * the next launch.
 */
const UpdateScreen = () => {
  const theme = useTheme()
  const errorAnimation = useRef<LottieView>(null)
  const [error, setError] = useState<UpdateError | null>(null)
  const [viewError, setViewError] = useState(false)
  const [isLoadingSlowly, setIsLoadingSlowly] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const navigation = useNavigation<RootStackNavigation>()

  useEffect(() => {
    let active = true
    const update = async () => {
      try {
        const result = await Updates.fetchUpdateAsync()
        if (!active) return
        if (result.isNew || result.isRollBackToEmbedded) {
          await Updates.reloadAsync()
        } else {
          navigation.replace('Root')
        }
      } catch (err) {
        if (!active) return
        const offline = isConnectivityError(err)
        if (!offline) errorTracking.captureException(err)
        setError({ offline, cause: err })
      }
    }

    void update()

    const timeout = setTimeout(() => setIsLoadingSlowly(true), 10000)
    return () => {
      active = false
      clearTimeout(timeout)
    }
  }, [navigation, attempt])

  const goHome = () => navigation.replace('Root')
  const tryAgain = () => {
    setError(null)
    setViewError(false)
    setIsLoadingSlowly(false)
    setAttempt((n) => n + 1)
  }

  return (
    <Wrapper
      style={{
        flexGrow: 1,
        padding: 30,
      }}
    >
      {!error ? (
        <View
          style={{
            flexGrow: 1,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Loader
            style={{ width: 160, height: 160 }}
            accessibilityLabel={i18n.t('update_downloading')}
          />
          {isLoadingSlowly && (
            <View style={{ gap: 10 }}>
              <Text>{i18n.t('loadingSlowly')}</Text>
              <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
                {i18n.t('loadingSlowly_description')}
              </Text>
              <Button
                onPress={goHome}
                accessibilityRole='button'
                style={{ alignSelf: 'flex-start', minHeight: 44 }}
              >
                <Text style={{ fontSize: 14, textDecorationLine: 'underline' }}>
                  {i18n.t('cancel')}
                </Text>
              </Button>
            </View>
          )}
        </View>
      ) : (
        <View
          style={{
            flexGrow: 1,
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
              <LottieView
                onLayout={() => errorAnimation.current?.play()}
                loop={true}
                ref={errorAnimation}
                style={{
                  width: '50%',
                }}
                source={require('@/assets/lottie/error.json')}
              />
            </View>
            <Text
              accessibilityRole='header'
              style={{ fontSize: 40, fontFamily: theme.fonts.bold }}
            >
              {error.offline
                ? i18n.t('common_offlineTitle')
                : i18n.t('thereWasAnErrorWithYourUpdate')}
            </Text>
            {error.offline ? (
              <Text style={{ color: theme.colors.textAlt }}>
                {i18n.t('update_offline')}
              </Text>
            ) : viewError ? (
              <ScrollView style={{ maxHeight: 150 }}>
                <Text style={{ color: theme.colors.textAlt }}>
                  {JSON.stringify(error.cause, null, 2)}
                </Text>
              </ScrollView>
            ) : (
              <Button
                onPress={() => setViewError(true)}
                accessibilityRole='button'
                style={{ alignSelf: 'flex-start', minHeight: 44 }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: theme.colors.textAlt,
                    fontFamily: theme.fonts.bold,
                    textDecorationLine: 'underline',
                  }}
                >
                  {i18n.t('viewError')}
                </Text>
              </Button>
            )}
          </View>
          <View style={{ gap: 10 }}>
            <ActionButton onPress={tryAgain}>
              {i18n.t('common_tryAgain')}
            </ActionButton>
            <Button
              onPress={goHome}
              accessibilityRole='button'
              style={{
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('md'),
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('goHome')}
              </Text>
            </Button>
          </View>
        </View>
      )}
    </Wrapper>
  )
}
export default UpdateScreen
