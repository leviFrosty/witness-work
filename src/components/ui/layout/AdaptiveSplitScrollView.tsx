import { ReactNode, RefObject, useRef } from 'react'
import { View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import FoldSplit from '@/components/ui/layout/FoldSplit'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'
import useScrollAnchor from '@/hooks/useScrollAnchor'
import type { RevealAboveSheet } from '@/hooks/useRevealAboveSheet'
import type { HideBarsScrollProps } from '@/hooks/useHideBarsOnScroll'
import type useReorderScroller from '@/components/ui/reorderable/useReorderScroller'

export type LeadingReorder = {
  scrollRef: RefObject<KeyboardAwareScrollView | null>
  scroller: ReturnType<typeof useReorderScroller>

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

  trailingReveal?: RevealAboveSheet

  scrollBars?: HideBarsScrollProps

  leadingReorder?: LeadingReorder
}

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
  const singleRef = useRef<KeyboardAwareScrollView>(null)
  const leadingRef = useRef<KeyboardAwareScrollView>(null)
  const trailingRef = useRef<KeyboardAwareScrollView>(null)
  const ownSingleFrame = useRef<View>(null)

  const singleFrame = leadingReorder?.scroller.frameRef ?? ownSingleFrame
  const leadingFrame = useRef<View>(null)
  const trailingFrame = useRef<View>(null)

  const bothRefs =
    (
      own: RefObject<KeyboardAwareScrollView | null>,
      theirs: RefObject<KeyboardAwareScrollView | null> | undefined
    ) =>
    (view: KeyboardAwareScrollView | null) => {
      own.current = view
      if (theirs) theirs.current = view
    }
  const anchor = useScrollAnchor(isWide)
  const foldColumn = useFoldColumn(isWide ? null : 720)

  if (!isWide) {
    const scroll = anchor.scroll('single', singleRef, singleFrame)
    const single = (
      <KeyboardAwareScrollView
        ref={bothRefs(
          singleRef,
          leadingReorder?.scrollRef ?? trailingReveal?.scrollRef
        )}
        {...scrollBars}
        onScrollBeginDrag={(e) => {
          scrollBars?.onScrollBeginDrag(e)
          scroll.onScrollBeginDrag()
        }}
        onScrollEndDrag={() => {
          scrollBars?.onScrollEndDrag()
          scroll.onScrollEndDrag()
        }}
        onMomentumScrollEnd={() => {
          scrollBars?.onMomentumScrollEnd()
          scroll.onMomentumScrollEnd()
        }}
        onScrollToTop={() => {
          scrollBars?.onScrollToTop()
          anchor.reset()
        }}
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
        contentContainerStyle={[
          {
            width: '100%',
            maxWidth: 720,
            alignSelf: 'center',
            paddingTop,
            paddingBottom: paddingBottom + (trailingReveal?.bottomInset ?? 0),
            paddingHorizontal: compactPaddingHorizontal,
            gap,
          },
          foldColumn,
        ]}
      >
        {scroll.origin}
        {header ? (
          <View ref={anchor.anchorRef('header', 'single')}>{header}</View>
        ) : null}
        <View ref={anchor.anchorRef('leading', 'single')}>{leading}</View>
        <View ref={anchor.anchorRef('trailing', 'single')}>{trailing}</View>
        {scroll.room}
      </KeyboardAwareScrollView>
    )
    return (
      <View ref={singleFrame} collapsable={false} style={{ flex: 1 }}>
        {single}
      </View>
    )
  }

  const leadingScroll = anchor.scroll('leading', leadingRef, leadingFrame)
  const trailingScroll = anchor.scroll('trailing', trailingRef, trailingFrame)

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
      <FoldSplit
        style={{ flex: 1, minHeight: 0 }}
        gap={gap}
        leadingFraction={leadingFraction}
        leadingRef={leadingReorder?.scroller.frameRef}
        leading={
          <View ref={leadingFrame} collapsable={false} style={{ flex: 1 }}>
            <KeyboardAwareScrollView
              ref={bothRefs(leadingRef, leadingReorder?.scrollRef)}
              onScrollBeginDrag={leadingScroll.onScrollBeginDrag}
              onScrollEndDrag={leadingScroll.onScrollEndDrag}
              onMomentumScrollEnd={leadingScroll.onMomentumScrollEnd}
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
              {leadingScroll.origin}
              <View ref={anchor.anchorRef('leading', 'leading')}>
                {leading}
              </View>
              {leadingScroll.room}
            </KeyboardAwareScrollView>
          </View>
        }
        trailing={
          <View ref={trailingFrame} collapsable={false} style={{ flex: 1 }}>
            <KeyboardAwareScrollView
              ref={bothRefs(trailingRef, trailingReveal?.scrollRef)}
              onScrollBeginDrag={trailingScroll.onScrollBeginDrag}
              onScrollEndDrag={trailingScroll.onScrollEndDrag}
              onMomentumScrollEnd={trailingScroll.onMomentumScrollEnd}
              onScrollToTop={anchor.reset}
              onScroll={trailingReveal?.onScroll}
              scrollEventThrottle={trailingReveal ? 16 : undefined}
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingBottom:
                  paddingBottom + (trailingReveal?.bottomInset ?? 0),
              }}
              keyboardShouldPersistTaps='handled'
            >
              {trailingScroll.origin}
              <View ref={anchor.anchorRef('trailing', 'trailing')}>
                {trailing}
              </View>
              {trailingScroll.room}
            </KeyboardAwareScrollView>
          </View>
        }
      />
    </View>
  )
}
