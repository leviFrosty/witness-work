import { useRef } from 'react'
import { Keyboard, ScrollView, View } from 'react-native'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import type {
  ScribeConversationController,
  ScribeTimelineItem,
} from '@/features/scribe/types'
import ScribeEmptyState from '@/features/scribe/components/ScribeEmptyState'
import ScribeReviewBlock from '@/features/scribe/components/ScribeReviewBlock'
import {
  ScribeAssistantText,
  ScribeErrorRow,
  ScribeNoticeRow,
  ScribeRunRow,
  ScribeUserBubble,
} from '@/features/scribe/components/ScribeTimelineItems'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

export const CONVERSATION_MAX_WIDTH = 720
const PADDING_TOP = 16

const Item = ({
  item,
  onSayAChange,
}: {
  item: ScribeTimelineItem
  onSayAChange?: () => void
}) => {
  switch (item.type) {
    case 'user':
      return <ScribeUserBubble text={item.text} source={item.source} />
    case 'assistant':
      return item.text ? <ScribeAssistantText text={item.text} /> : null
    case 'proposal':
      return (
        <ScribeReviewBlock
          proposalId={item.proposalId}
          onSayAChange={onSayAChange}
        />
      )
    case 'notice':
      return <ScribeNoticeRow notice={item.notice} />
  }
}

interface Props {
  controller: ScribeConversationController

  onSayAChange?: () => void
}

const ScribeTimeline = ({ controller, onSayAChange }: Props) => {
  const foldColumn = useFoldColumn(CONVERSATION_MAX_WIDTH)
  const { isWide } = useAdaptiveLayout()
  const scrollRef = useRef<ScrollView>(null)

  const shownProposal = useRef<string | null>(null)

  const followed = useRef<{ id: string; y: number } | null>(null)
  const { items, run } = controller
  const last = items[items.length - 1]
  const empty = items.length === 0 && run.phase === 'idle'

  const alignFollowed = () => {
    if (!followed.current) return
    scrollRef.current?.scrollTo({
      y: Math.max(0, PADDING_TOP + followed.current.y - 12),
      animated: true,
    })
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      keyboardShouldPersistTaps='handled'
      keyboardDismissMode='interactive'
      onScrollBeginDrag={() => {
        followed.current = null
      }}
      onLayout={alignFollowed}
      onContentSizeChange={() => {
        if (followed.current && followed.current.id !== last?.id)
          followed.current = null

        if (last?.type === 'proposal' && run.phase !== 'error') {
          alignFollowed()
          return
        }
        scrollRef.current?.scrollToEnd({ animated: true })
      }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: PADDING_TOP,
        paddingBottom: 16,
      }}
    >
      {}
      <View
        style={[
          {
            flexGrow: 1,
            width: '100%',
            maxWidth: CONVERSATION_MAX_WIDTH,
            alignSelf: 'center',
            paddingHorizontal: isWide ? 24 : 15,
            gap: 18,
          },
          foldColumn,
        ]}
      >
        {empty ? <ScribeEmptyState /> : null}
        {items.map((item, index) => (
          <View
            key={item.id}
            onLayout={
              index === items.length - 1 && item.type === 'proposal'
                ? (e) => {
                    const { y } = e.nativeEvent.layout
                    if (shownProposal.current !== item.id) {
                      shownProposal.current = item.id
                      followed.current = { id: item.id, y }

                      Keyboard.dismiss()
                    } else if (followed.current?.id === item.id) {
                      followed.current = { id: item.id, y }
                    }
                    alignFollowed()
                  }
                : undefined
            }
          >
            <Item item={item} onSayAChange={onSayAChange} />
          </View>
        ))}
        <ScribeRunRow run={run} conversationId={controller.conversationId} />
        {run.phase === 'error' ? (
          <ScribeErrorRow
            error={run.error}
            onRetry={() => void controller.retry()}
          />
        ) : null}
      </View>
    </ScrollView>
  )
}

export default ScribeTimeline
