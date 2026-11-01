import { useContext, useEffect, useRef } from 'react'
import {
  AppState,
  useWindowDimensions,
  type AppStateStatus,
  type View,
} from 'react-native'
import {
  NavigationContainerRefContext,
  NavigationRouteContext,
  useIsFocused,
} from '@react-navigation/native'
import { analytics } from '@/lib/analytics'
import { VisibilityViewportContext } from '@/contexts/visibilityViewport'
import type { FeatureKey } from '@/lib/featureAccess'
import {
  createSupporterGateAttribution,
  type SupporterGateAttribution,
  type SupporterGateSurface,
} from '@/lib/supporterGateAnalytics'

export default function useSupporterGateAnalytics(
  feature: FeatureKey,
  surface: SupporterGateSurface,
  hasAccess: boolean
) {
  const route = useContext(NavigationRouteContext)
  const root = useContext(NavigationContainerRefContext)
  const sourceScreen = route?.name ?? root?.getCurrentRoute()?.name ?? 'unknown'
  const focused = useIsFocused()
  const { width, height } = useWindowDimensions()
  const headerRef = useRef<View>(null)
  const viewportRef = useContext(VisibilityViewportContext)
  const attribution = useRef<SupporterGateAttribution | undefined>(undefined)

  useEffect(() => {
    attribution.current = undefined
  }, [feature, surface, sourceScreen, focused, hasAccess])

  useEffect(() => {
    if (hasAccess || !focused) return
    let disposed = false
    let measuring = false
    let timer: ReturnType<typeof setInterval> | undefined
    const stop = () => {
      clearInterval(timer)
      timer = undefined
    }

    const measure = () => {
      if (attribution.current) {
        stop()
        return
      }
      if (
        disposed ||
        measuring ||
        AppState.currentState !== 'active' ||
        !headerRef.current ||
        (viewportRef && !viewportRef.current)
      )
        return
      measuring = true
      const measureHeader = (
        left: number,
        top: number,
        clipWidth: number,
        clipHeight: number
      ) => {
        if (disposed || !headerRef.current) {
          measuring = false
          return
        }
        headerRef.current.measureInWindow((x, y, w, h) => {
          measuring = false
          if (
            disposed ||
            attribution.current ||
            AppState.currentState !== 'active'
          )
            return
          const visibleWidth = Math.max(
            0,
            Math.min(x + w, left + clipWidth, width) - Math.max(x, left, 0)
          )
          const visibleHeight = Math.max(
            0,
            Math.min(y + h, top + clipHeight, height) - Math.max(y, top, 0)
          )
          if (w <= 0 || h <= 0 || visibleWidth * visibleHeight < w * h * 0.5)
            return
          attribution.current = createSupporterGateAttribution(
            feature,
            sourceScreen,
            surface
          )
          analytics.capture(
            'supporter_feature_gate_viewed',
            attribution.current
          )
          stop()
        })
      }
      if (viewportRef) viewportRef.current?.measureInWindow(measureHeader)
      else measureHeader(0, 0, width, height)
    }

    const watch = (state: AppStateStatus) => {
      if (state !== 'active') return stop()
      measure()
      if (!attribution.current) timer ??= setInterval(measure, 500)
    }
    watch(AppState.currentState)
    const subscription = AppState.addEventListener('change', watch)
    return () => {
      disposed = true
      stop()
      subscription.remove()
    }
  }, [
    feature,
    surface,
    sourceScreen,
    focused,
    hasAccess,
    width,
    height,
    viewportRef,
  ])

  const recordClick = () => {
    if (!attribution.current) {
      attribution.current = createSupporterGateAttribution(
        feature,
        sourceScreen,
        surface
      )
      analytics.capture('supporter_feature_gate_viewed', attribution.current)
    }
    analytics.capture('supporter_feature_gate_clicked', attribution.current)
    return attribution.current
  }

  return { headerRef, recordClick }
}
