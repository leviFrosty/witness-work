import { ReactNode, useEffect, useId, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  BackHandler,
  findNodeHandle,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useNavigation } from '@react-navigation/native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Portal } from 'tamagui'
import useTheme from '@/contexts/theme'
import { VisibilityViewportContext } from '@/contexts/visibilityViewport'
import { useTakeoverHold } from '@/hooks/useTakeoverTurn'
import { useToWindow } from '@/components/ui/sheetWindowFrame'
import { useWindowSideInsets } from '@/components/ui/layout/HorizontalSafeArea'
import { leftForPhysicalX } from '@/lib/direction'
import { clampToFoldSide, type FoldDivision } from '@/lib/foldSplit'
import { useDisplayRegions } from '@/stores/displayRegions'

type AnchorRect = { x: number; y: number; width: number; height: number }

export type ResolveAnchorPosition = (args: {
  anchor: AnchorRect
  windowWidth: number
  windowHeight: number
  contentWidth: number
}) => {
  top?: number
  bottom?: number
  left: number

  maxHeight?: number
}

interface Props {
  renderTrigger: (props: {
    onPress: () => void
    expanded: boolean
    anchorRef: React.RefObject<View | null>
  }) => ReactNode

  contentWidth: number

  presentation?: 'modal' | 'portal'

  accessibilityFocusRef?: React.RefObject<View | null>

  resolvePosition?: ResolveAnchorPosition

  contentStyle?: StyleProp<ViewStyle>

  children:
    | ReactNode
    | ((props: {
        close: () => void
        closeThen: (action: () => void) => void
      }) => ReactNode)
}

const ANIMATION_MS = 140
const NO_FOLDS: FoldDivision[] = []
const KEYBOARD_SETTLE_FALLBACK_MS = 600

let cancelActivePopoverPreparation: (() => void) | null = null

const UNMOUNT_DELAY_MS = 250

const defaultResolvePosition: ResolveAnchorPosition = ({
  anchor,
  windowWidth,
  contentWidth,
}) => {
  const margin = 12
  const left = Math.min(
    Math.max(margin, anchor.x),
    windowWidth - contentWidth - margin
  )
  return { top: anchor.y + anchor.height + 8, left }
}

const AnchoredPopover = ({
  renderTrigger,
  contentWidth,
  resolvePosition = defaultResolvePosition,
  contentStyle,
  presentation = 'modal',
  accessibilityFocusRef,
  children,
}: Props) => {
  const portal = presentation === 'portal'
  const theme = useTheme()
  const navigation = useNavigation()
  const viewportRef = useRef<View>(null)
  const dims = useWindowDimensions()
  const sideInsets = useWindowSideInsets()
  const divisions = useDisplayRegions((s) => s.regions?.divisions ?? NO_FOLDS)
  const anchorRef = useRef<View>(null)

  const toWindow = useToWindow()
  const keyboardRaised = useRef(Keyboard.isVisible())
  const keyboardDidHideSubscription = useRef<ReturnType<
    typeof Keyboard.addListener
  > | null>(null)
  const keyboardFallback = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingOpenCancellation = useRef<(() => void) | null>(null)
  const openFrame = useRef<number | null>(null)
  const openRequest = useRef(0)
  const afterDismiss = useRef<(() => void) | null>(null)
  const wasMounted = useRef(false)
  const [anchor, setAnchor] = useState<AnchorRect | null>(null)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const progress = useSharedValue(0)

  const holdId = useId()
  useTakeoverHold(`popover:${holdId}`, mounted)

  useEffect(() => {
    if (open) {
      setMounted(true)
      progress.value = withTiming(1, { duration: ANIMATION_MS })
      return
    }
    progress.value = withTiming(0, { duration: ANIMATION_MS })
    const t = setTimeout(() => setMounted(false), UNMOUNT_DELAY_MS)
    return () => clearTimeout(t)
  }, [open, progress])

  useEffect(() => {
    const markRaised = () => {
      keyboardRaised.current = true
    }
    const markHidden = () => {
      keyboardRaised.current = false
    }
    const subscriptions = [
      Keyboard.addListener('keyboardWillShow', markRaised),
      Keyboard.addListener('keyboardDidShow', markRaised),
      Keyboard.addListener('keyboardDidHide', markHidden),
    ]

    return () => {
      subscriptions.forEach((subscription) => subscription.remove())
      pendingOpenCancellation.current?.()
      openRequest.current += 1
      keyboardDidHideSubscription.current?.remove()
      keyboardDidHideSubscription.current = null
      if (keyboardFallback.current != null)
        clearTimeout(keyboardFallback.current)
      keyboardFallback.current = null
      if (openFrame.current != null) cancelAnimationFrame(openFrame.current)
      openFrame.current = null
    }
  }, [])

  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      pendingOpenCancellation.current?.()
      openRequest.current += 1
      keyboardDidHideSubscription.current?.remove()
      keyboardDidHideSubscription.current = null
      if (keyboardFallback.current != null)
        clearTimeout(keyboardFallback.current)
      keyboardFallback.current = null
      if (openFrame.current != null) cancelAnimationFrame(openFrame.current)
      openFrame.current = null
      setOpen(false)
    })
    return unsubscribe
  }, [navigation])

  const measureAndOpen = (requestId: number, skipKeyboardWait = false) => {
    if (requestId !== openRequest.current) return
    keyboardDidHideSubscription.current?.remove()
    keyboardDidHideSubscription.current = null
    if (keyboardFallback.current != null) clearTimeout(keyboardFallback.current)
    keyboardFallback.current = null

    const keyboardIsRaised = keyboardRaised.current || Keyboard.isVisible()
    if (keyboardIsRaised && !skipKeyboardWait) {
      keyboardDidHideSubscription.current = Keyboard.addListener(
        'keyboardDidHide',
        () => measureAndOpen(requestId)
      )

      keyboardFallback.current = setTimeout(
        () => measureAndOpen(requestId, true),
        KEYBOARD_SETTLE_FALLBACK_MS
      )
      Keyboard.dismiss()
      return
    }

    openFrame.current = requestAnimationFrame(() => {
      openFrame.current = null
      if (requestId !== openRequest.current) return
      if (
        !skipKeyboardWait &&
        (keyboardRaised.current || Keyboard.isVisible())
      ) {
        measureAndOpen(requestId)
        return
      }

      anchorRef.current?.measureInWindow((x, y, width, height) => {
        if (requestId !== openRequest.current) return
        if (
          !skipKeyboardWait &&
          (keyboardRaised.current || Keyboard.isVisible())
        ) {
          measureAndOpen(requestId)
          return
        }

        setAnchor(toWindow({ x, y, width, height }))

        openFrame.current = requestAnimationFrame(() => {
          openFrame.current = null
          if (requestId !== openRequest.current) return
          if (
            !skipKeyboardWait &&
            (keyboardRaised.current || Keyboard.isVisible())
          ) {
            measureAndOpen(requestId)
            return
          }
          const cancellation = pendingOpenCancellation.current
          if (cancelActivePopoverPreparation === cancellation)
            cancelActivePopoverPreparation = null
          pendingOpenCancellation.current = null
          setOpen(true)
        })
      })
    })
  }

  const handlePress = () => {
    afterDismiss.current = null
    cancelActivePopoverPreparation?.()
    const requestId = ++openRequest.current
    keyboardDidHideSubscription.current?.remove()
    keyboardDidHideSubscription.current = null
    if (keyboardFallback.current != null) clearTimeout(keyboardFallback.current)
    keyboardFallback.current = null
    if (openFrame.current != null) cancelAnimationFrame(openFrame.current)
    openFrame.current = null

    const cancelRequest = () => {
      if (requestId === openRequest.current) {
        openRequest.current += 1
        keyboardDidHideSubscription.current?.remove()
        keyboardDidHideSubscription.current = null
        if (keyboardFallback.current != null)
          clearTimeout(keyboardFallback.current)
        keyboardFallback.current = null
        if (openFrame.current != null) cancelAnimationFrame(openFrame.current)
        openFrame.current = null
      }
      if (cancelActivePopoverPreparation === cancelRequest)
        cancelActivePopoverPreparation = null
      if (pendingOpenCancellation.current === cancelRequest)
        pendingOpenCancellation.current = null
    }
    pendingOpenCancellation.current = cancelRequest
    cancelActivePopoverPreparation = cancelRequest
    measureAndOpen(requestId)
  }

  const close = () => setOpen(false)

  const closeThen = (action: () => void) => {
    afterDismiss.current = action
    setOpen(false)
  }

  useEffect(() => {
    if (Platform.OS !== 'android' && !portal) return
    if (mounted) {
      if (!wasMounted.current && portal) {
        const target = accessibilityFocusRef?.current
        const handle = target && findNodeHandle(target)
        if (handle) AccessibilityInfo.setAccessibilityFocus(handle)
      }
      wasMounted.current = true
      return
    }
    if (!wasMounted.current) return
    wasMounted.current = false
    const then = afterDismiss.current
    afterDismiss.current = null
    then?.()
    if (!accessibilityFocusRef || !navigation.isFocused()) return
    const handle = anchorRef.current && findNodeHandle(anchorRef.current)
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle)
  }, [mounted, portal, accessibilityFocusRef, navigation])

  useEffect(() => {
    if (!portal || !open) return
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        setOpen(false)
        return true
      }
    )
    return () => subscription.remove()
  }, [portal, open])

  const resolved: {
    top?: number
    bottom?: number
    left: number
    maxHeight?: number
  } = anchor
    ? resolvePosition({
        anchor: {
          ...anchor,
          x: leftForPhysicalX(anchor.x, anchor.width, dims.width),
        },
        windowWidth: dims.width,
        windowHeight: dims.height,
        contentWidth,
      })
    : { top: 0, left: 0 }

  const positionStyle = anchor
    ? {
        ...resolved,
        left: leftForPhysicalX(
          clampToFoldSide({
            x: leftForPhysicalX(resolved.left, contentWidth, dims.width),
            width: contentWidth,
            anchorX: anchor.x + anchor.width / 2,
            windowWidth: dims.width,
            divisions,
            insets: sideInsets,
            margin: 12,
          }),
          contentWidth,
          dims.width
        ),
      }
    : resolved

  const { maxHeight, ...placement } = positionStyle
  const content =
    typeof children === 'function' ? children({ close, closeThen }) : children

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }))

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.96 + 0.04 * progress.value }],
  }))

  const overlay = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.2)',
          },
          backdropAnimatedStyle,
        ]}
      >
        <Pressable accessible={false} style={{ flex: 1 }} onPress={close} />
      </Animated.View>
      <Animated.View
        ref={viewportRef}
        collapsable={false}
        accessibilityViewIsModal
        onAccessibilityEscape={close}
        style={[
          {
            position: 'absolute',
            width: contentWidth,
            borderRadius: theme.numbers.borderRadiusMd,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.card,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 8,
          },

          maxHeight != null
            ? { overflow: 'hidden' }
            : [{ padding: 12 }, contentStyle],
          placement,
          contentAnimatedStyle,
        ]}
      >
        <VisibilityViewportContext value={viewportRef}>
          {maxHeight != null ? (
            <ScrollView
              style={{ maxHeight }}
              contentContainerStyle={[{ padding: 12 }, contentStyle]}
              showsVerticalScrollIndicator
            >
              {content}
            </ScrollView>
          ) : (
            content
          )}
        </VisibilityViewportContext>
      </Animated.View>
    </GestureHandlerRootView>
  )

  if (portal) {
    return (
      <>
        {renderTrigger({ onPress: handlePress, anchorRef, expanded: open })}
        {}
        {mounted ? <Portal zIndex={90_000}>{overlay}</Portal> : null}
      </>
    )
  }

  return (
    <>
      {renderTrigger({ onPress: handlePress, anchorRef, expanded: open })}
      <Modal
        visible={mounted}
        transparent
        statusBarTranslucent
        animationType='none'
        onRequestClose={close}
        onShow={() => {
          const target = accessibilityFocusRef?.current
          const handle = target && findNodeHandle(target)
          if (handle) AccessibilityInfo.setAccessibilityFocus(handle)
        }}
        onDismiss={() => {
          const then = afterDismiss.current
          afterDismiss.current = null
          then?.()
          if (!accessibilityFocusRef || !navigation.isFocused()) return
          const handle = anchorRef.current && findNodeHandle(anchorRef.current)
          if (handle) AccessibilityInfo.setAccessibilityFocus(handle)
        }}
      >
        {overlay}
      </Modal>
    </>
  )
}

export default AnchoredPopover
