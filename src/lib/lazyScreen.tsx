import { Suspense, lazy, useEffect, useState, type ComponentType } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import FallbackOnError from '@/lib/canvasKit/FallbackOnError'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'

function ScreenLoading() {
  const theme = useTheme()
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.background,
      }}
    >
      <ActivityIndicator color={theme.colors.textAlt} />
    </View>
  )
}

function ScreenUnavailable({ onOnline }: { onOnline: () => void }) {
  const theme = useTheme()
  const navigation = useNavigation()
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [onOnline])
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        backgroundColor: theme.colors.background,
      }}
    >
      <Text style={{ textAlign: 'center', color: theme.colors.textAlt }}>
        {i18n.t('screenUnavailable')}
      </Text>
      {navigation.canGoBack() && (
        <Button
          onPress={() => navigation.goBack()}
          style={{ minHeight: 44, paddingHorizontal: 16 }}
        >
          <Text style={{ color: theme.colors.accent }}>{i18n.t('goBack')}</Text>
        </Button>
      )}
    </View>
  )
}

export function lazyScreen<P extends object>(
  load: () => Promise<ComponentType<P>>,
  {
    onError = (error: unknown) =>
      logger.warn('[lazyScreen] A screen failed to load:', error),
  }: { onError?: (error: unknown) => void } = {}
): ComponentType<P> {
  const make = () => lazy(async () => ({ default: await load() }))

  const screen = { Component: make() }
  return function LazyScreen(props: P) {
    const [attempt, setAttempt] = useState(0)
    const Screen = screen.Component
    const retry = () => {
      screen.Component = make()
      setAttempt((count) => count + 1)
    }
    return (
      <FallbackOnError
        key={attempt}
        fallback={<ScreenUnavailable onOnline={retry} />}
        onError={onError}
      >
        <Suspense fallback={<ScreenLoading />}>
          <Screen {...props} />
        </Suspense>
      </FallbackOnError>
    )
  }
}
