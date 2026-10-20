import { ReactNode, RefObject } from 'react'
import { View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import type { RevealAboveSheet } from '@/hooks/useRevealAboveSheet'
import type { HideBarsScrollProps } from '@/hooks/useHideBarsOnScroll'
import type useReorderScroller from '@/components/ui/reorderable/useReorderScroller'

/** What lets an item dragged in `leading` scroll the view it's in. */
export type LeadingReorder = {
  scrollRef: RefObject<KeyboardAwareScrollView | null>
  scroller: ReturnType<typeof useReorderScroller>
  /** Off while an item is held, so the finger drags it instead. */
  scrollEnabled: boolean
}

type Props = {
  leading: ReactNode
  trailing: ReactNode
  header?: ReactNode
  leadingFraction?: number
  paddingTop?: number
  paddingBottom: number
  compactPaddingHorizontal?: number
  gap?: number
  /** Keeps a view in `trailing` above a day's sheet; see `useRevealAboveSheet`. */
  trailingReveal?: RevealAboveSheet
  /**
   * Tucks the screen's header and tab bar away as the single column scrolls;
   * see `useHideBarsOnScroll`. Wide layouts keep them.
   */
  scrollBars?: HideBarsScrollProps
  /**
   * Rearrangeable items in `leading` (see `ReorderableContainer`). Its scroll
   * view is the single column's, so don't pass `trailingReveal` with it.
   */
  leadingReorder?: LeadingReorder
}

/** Keep reference content visible while browsing records in a wide window. */
export default function AdaptiveSplitScrollView({
  leading,
  trailing,
  header,
  leadingFraction = 0.44,
  paddingTop = 15,
  paddingBottom,
  compactPaddingHorizontal = 15,
  gap = 24,
  trailingReveal,
  scrollBars,
  leadingReorder,
}: Props) {
  const { isWide, contentMaxWidth } = useAdaptiveLayout()
  const reorder = leadingReorder?.scroller.props

  if (!isWide) {
    const single = (
      <KeyboardAwareScrollView
        ref={leadingReorder?.scrollRef ?? trailingReveal?.scrollRef}
        {...scrollBars}
        onScroll={(e) => {
          trailingReveal?.onScroll(e)
          scrollBars?.onScroll(e)
          reorder?.onScroll(e)
        }}
        onLayout={(e) => {
          scrollBars?.onLayout(e)
          reorder?.onLayout()
        }}
        onContentSizeChange={(width, height) => {
          scrollBars?.onContentSizeChange(width, height)
          reorder?.onContentSizeChange(width, height)
        }}
        scrollEnabled={leadingReorder?.scrollEnabled ?? true}
        scrollEventThrottle={
          trailingReveal || scrollBars || leadingReorder ? 16 : undefined
        }
        style={{ flex: 1 }}
        keyboardShouldPersistTaps='handled'
        contentContainerStyle={{
          width: '100%',
          maxWidth: 720,
          alignSelf: 'center',
          paddingTop,
          paddingBottom: paddingBottom + (trailingReveal?.bottomInset ?? 0),
          paddingHorizontal: compactPaddingHorizontal,
          gap,
        }}
      >
        {header}
        {leading}
        {trailing}
      </KeyboardAwareScrollView>
    )
    // The reorder scroller measures the scroll view's frame from a view.
    return leadingReorder ? (
      <View
        ref={leadingReorder.scroller.frameRef}
        collapsable={false}
        style={{ flex: 1 }}
      >
        {single}
      </View>
    ) : (
      single
    )
  }

  return (
    <View
      style={{
        flex: 1,
        width: '100%',
        maxWidth: contentMaxWidth,
        alignSelf: 'center',
        paddingHorizontal: 24,
        paddingTop,
      }}
    >
      {header && <View style={{ paddingBottom: gap }}>{header}</View>}
      <View style={{ flex: 1, minHeight: 0, flexDirection: 'row', gap }}>
        <View
          ref={leadingReorder?.scroller.frameRef}
          collapsable={false}
          style={{ flex: leadingFraction, minWidth: 0 }}
        >
          <KeyboardAwareScrollView
            ref={leadingReorder?.scrollRef}
            onScroll={reorder?.onScroll}
            onLayout={reorder?.onLayout}
            onContentSizeChange={reorder?.onContentSizeChange}
            scrollEnabled={leadingReorder?.scrollEnabled ?? true}
            scrollEventThrottle={leadingReorder ? 16 : undefined}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom }}
            keyboardShouldPersistTaps='handled'
            scrollsToTop={false}
          >
            {leading}
          </KeyboardAwareScrollView>
        </View>
        <KeyboardAwareScrollView
          ref={trailingReveal?.scrollRef}
          onScroll={trailingReveal?.onScroll}
          scrollEventThrottle={trailingReveal ? 16 : undefined}
          style={{ flex: 1 - leadingFraction, minWidth: 0 }}
          contentContainerStyle={{
            paddingBottom: paddingBottom + (trailingReveal?.bottomInset ?? 0),
          }}
          keyboardShouldPersistTaps='handled'
        >
          {trailing}
        </KeyboardAwareScrollView>
      </View>
    </View>
  )
}
