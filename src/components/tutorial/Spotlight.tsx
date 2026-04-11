import React, { useEffect, useState } from 'react'
import {
  InteractionManager,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import { useOptionalTutorialContext } from '../../providers/TutorialProvider'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface Props {
  targetId: string
  /** Extra space around the measured target rect. */
  padding?: number
  /** Rounded cutout radius. */
  borderRadius?: number
  children: (rect: Rect | null) => React.ReactNode
}

/**
 * Renders a 4-rect dim overlay with a transparent hole over the registered
 * target. Children receive the measured rect so tooltip placement can be
 * computed by the caller. Target taps pass through the hole (which is just
 * empty space — no absolute rect sits on top of the target).
 */
export const Spotlight: React.FC<Props> = ({
  targetId,
  padding = 8,
  borderRadius = 12,
  children,
}) => {
  const ctx = useOptionalTutorialContext()
  const { width: screenW, height: screenH } = useWindowDimensions()
  const [rect, setRect] = useState<Rect | null>(null)

  useEffect(() => {
    if (!ctx) return
    let cancelled = false

    const measure = () => {
      const handle = ctx.getTarget(targetId)
      if (!handle || !handle.ref.current) {
        setRect(null)
        return
      }
      handle.ref.current.measureInWindow((x, y, width, height) => {
        if (cancelled) return
        if (width === 0 && height === 0) {
          setRect(null)
          return
        }
        // If the target sits outside the visible window, treat it as
        // unmeasurable so the overlay falls back to its "can't find
        // target" state (with a manual Next button).
        const offScreen =
          y + height < 0 || y > screenH || x + width < 0 || x > screenW
        if (offScreen) {
          setRect(null)
          return
        }
        setRect({ x, y, width, height })
      })
    }

    // Measure after any in-flight interaction (e.g. nav transition) settles.
    const task = InteractionManager.runAfterInteractions(() => {
      measure()
    })

    // Periodically re-measure in case the target moves (scroll, layout).
    const interval = setInterval(measure, 400)

    return () => {
      cancelled = true
      task.cancel?.()
      clearInterval(interval)
    }
  }, [ctx, targetId, screenW, screenH])

  // Four dim rectangles around the (padded) target hole. If we haven't got a
  // rect, render a lightweight full-screen dim that lets through touches
  // (pointerEvents='box-none') so the tooltip's Skip/Next buttons remain
  // tappable even when the target can't be measured.
  const padded = rect
    ? {
        x: Math.max(0, rect.x - padding),
        y: Math.max(0, rect.y - padding),
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      }
    : null

  return (
    <View pointerEvents='box-none' style={StyleSheet.absoluteFill}>
      {padded ? (
        <>
          {/* top */}
          <View
            pointerEvents='auto'
            style={[
              styles.dim,
              { top: 0, left: 0, right: 0, height: padded.y },
            ]}
          />
          {/* bottom */}
          <View
            pointerEvents='auto'
            style={[
              styles.dim,
              {
                top: padded.y + padded.height,
                left: 0,
                right: 0,
                bottom: 0,
              },
            ]}
          />
          {/* left */}
          <View
            pointerEvents='auto'
            style={[
              styles.dim,
              {
                top: padded.y,
                left: 0,
                width: padded.x,
                height: padded.height,
              },
            ]}
          />
          {/* right */}
          <View
            pointerEvents='auto'
            style={[
              styles.dim,
              {
                top: padded.y,
                left: padded.x + padded.width,
                right: 0,
                height: padded.height,
              },
            ]}
          />
          {/* ring around hole for emphasis */}
          <View
            pointerEvents='none'
            style={{
              position: 'absolute',
              top: padded.y,
              left: padded.x,
              width: padded.width,
              height: padded.height,
              borderRadius,
              borderWidth: 2,
              borderColor: 'rgba(255,255,255,0.9)',
            }}
          />
        </>
      ) : (
        <View
          pointerEvents='none'
          style={[styles.dim, StyleSheet.absoluteFillObject]}
        />
      )}
      {children(rect)}
    </View>
  )
}

const styles = StyleSheet.create({
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
})
