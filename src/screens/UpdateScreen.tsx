import { View, ScrollView } from 'react-native'
import LottieView from 'lottie-react-native'
import Text from '../components/MyText'
import { useEffect, useRef, useState } from 'react'
import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import * as Updates from 'expo-updates'
import * as Sentry from '@sentry/react-native'
import ActionButton from '../components/ActionButton'
import { useNavigation } from '@react-navigation/native'
import Wrapper from '../components/layout/Wrapper'
import Button from '../components/Button'
import { RootStackNavigation } from '../types/rootStack'

const UpdateScreen = () => {
  const theme = useTheme()
  const loadingAnimation = useRef<LottieView>(null)
  const errorAnimation = useRef<LottieView>(null)
  const [error, setError] = useState<unknown>()
  const [viewError, setViewError] = useState(false)
  const [isLoadingSlowly, setIsLoadingSlowly] = useState(false)
  const navigation = useNavigation<RootStackNavigation>()

  useEffect(() => {
    const update = async () => {
      try {
        const update = await Updates.checkForUpdateAsync()
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync()
          await Updates.reloadAsync()
        }
      } catch (err) {
        setError(err)
        Sentry.captureException(err)
      }
    }

    update()

    const timeout = setTimeout(() => setIsLoadingSlowly(true), 10000)
    return () => clearTimeout(timeout)
  }, [navigation])

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
          <LottieView
            onLayout={() => loadingAnimation.current?.play()}
            loop={true}
            ref={loadingAnimation}
            style={{
              width: '100%',
            }}
            source={require('./../assets/lottie/loading.json')}
          />
          {isLoadingSlowly && (
            <View style={{ gap: 10 }}>
              <Text>{i18n.t('loadingSlowly')}</Text>
              <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
                {i18n.t('loadingSlowly_description')}
              </Text>
              <Button>
                <Text
                  onPress={() => navigation.replace('Root')}
                  style={{ fontSize: 14, textDecorationLine: 'underline' }}
                >
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
                source={require('./../assets/lottie/error.json')}
              />
            </View>
            <Text style={{ fontSize: 40, fontFamily: theme.fonts.bold }}>
              {i18n.t('thereWasAnErrorWithYourUpdate')}
            </Text>
            {viewError ? (
              <ScrollView style={{ maxHeight: 150 }}>
                <Text style={{ color: theme.colors.textAlt }}>
                  {JSON.stringify(error, null, 2)}
                </Text>
              </ScrollView>
            ) : (
              <Text
                style={{
                  fontSize: 14,
                  color: theme.colors.textAlt,
                  fontFamily: theme.fonts.bold,
                  textDecorationLine: 'underline',
                }}
                onPress={() => setViewError(true)}
              >
                {i18n.t('viewError')}
              </Text>
            )}
          </View>
          <ActionButton onPress={() => navigation.replace('Root')}>
            {i18n.t('goHome')}
          </ActionButton>
        </View>
      )}
    </Wrapper>
  )
}
export default UpdateScreen
