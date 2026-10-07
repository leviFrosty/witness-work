import {
  Children,
  isValidElement,
  PropsWithChildren,
  ReactElement,
  ReactNode,
  useEffect,
  useState,
} from 'react'
import { LayoutChangeEvent, View, ViewProps } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import useTheme from '@/contexts/theme'
import {
  drawerLayout,
  inputLayout,
  useInputLayout,
} from '@/components/ui/inputs/InputLayout'

type Props = ViewProps & {
  /**
   * Rows added or removed after mount expand and collapse in place. Turn off
   * for a single child that must fill the Section, like a virtualized list.
   */
  animateRows?: boolean
}

const ROW_ANIMATION = { duration: 220, easing: Easing.out(Easing.cubic) }

type Entry = {
  key: string
  element: ReactElement | undefined
  present: boolean
  /** Added after the Section mounted, so it expands in. */
  animateIn: boolean
}

/**
 * Lines up this render's rows with the last ones, keeping removed rows in place
 * (not present) so they can collapse out.
 */
function mergeRows(previous: Entry[], current: ReactElement[]): Entry[] {
  const currentKeys = new Set(current.map((element) => String(element.key)))
  const merged: Entry[] = []
  let index = 0
  const keepLeaving = (entry: Entry) =>
    merged.push({ ...entry, element: undefined, present: false })
  for (const element of current) {
    const key = String(element.key)
    while (index < previous.length && !currentKeys.has(previous[index].key)) {
      keepLeaving(previous[index])
      index++
    }
    if (previous[index]?.key === key) index++
    const before = previous.find((entry) => entry.key === key)
    merged.push({
      key,
      element,
      present: true,
      animateIn: before ? before.animateIn : true,
    })
  }
  for (; index < previous.length; index++) {
    if (!currentKeys.has(previous[index].key)) keepLeaving(previous[index])
  }
  return merged
}

const sameRows = (a: Entry[], b: Entry[]) =>
  a.length === b.length &&
  a.every(
    (entry, index) =>
      entry.key === b[index].key && entry.present === b[index].present
  )

/** Expands in when added and collapses out when removed. */
function SectionRow({
  rowKey,
  present,
  animateIn,
  onExited,
  children,
}: {
  rowKey: string
  present: boolean
  animateIn: boolean
  onExited: (key: string) => void
  children: ReactNode
}) {
  // Keeps showing the last content while collapsing out.
  const [lastChildren, setLastChildren] = useState(children)
  if (present && children !== lastChildren) setLastChildren(children)
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(animateIn ? 0 : 1)
  const height = useSharedValue(0)
  const [measured, setMeasured] = useState(!animateIn)
  // While expanding in, the content sits out of flow so it can be measured
  // at full height; once it has, it rejoins the flow and sizes the row.
  const [inFlow, setInFlow] = useState(!animateIn)
  const autoHeight = useSharedValue(!animateIn)

  useEffect(() => {
    autoHeight.value = inFlow
  }, [inFlow, autoHeight])

  useEffect(() => {
    if (!measured) return
    const target = present ? 1 : 0
    if (reduceMotion) {
      progress.value = target
      if (present) setInFlow(true)
      else onExited(rowKey)
      return
    }
    progress.value = withTiming(target, ROW_ANIMATION, (finished) => {
      if (!finished) return
      if (present) scheduleOnRN(setInFlow, true)
      else scheduleOnRN(onExited, rowKey)
    })
  }, [measured, present, reduceMotion, onExited, rowKey, progress])

  const animatedStyle = useAnimatedStyle(() =>
    progress.value === 1 && autoHeight.value
      ? { height: 'auto', opacity: 1, overflow: 'visible' }
      : {
          height: height.value * progress.value,
          opacity: progress.value,
          overflow: 'hidden',
        }
  )

  const onLayout = (event: LayoutChangeEvent) => {
    const measuredHeight = event.nativeEvent.layout.height
    height.value = measuredHeight
    // The first pass can report 0 before the content has laid out.
    if (!measured && measuredHeight > 0) setMeasured(true)
  }

  return (
    <Animated.View style={animatedStyle}>
      <View
        style={inFlow ? undefined : { position: 'absolute', left: 0, right: 0 }}
        onLayout={onLayout}
      >
        {present ? children : lastChildren}
      </View>
    </Animated.View>
  )
}

/**
 * Rows added or removed after mount expand and collapse in place. Section does
 * this for its own rows; wrap rows a component adds inside a Section with it.
 */
export function SectionRows({ children }: { children: ReactNode }) {
  const current = Children.toArray(children).filter(isValidElement)
  const [rows, setRows] = useState<Entry[]>(() =>
    current.map((element) => ({
      key: String(element.key),
      element,
      present: true,
      animateIn: false,
    }))
  )
  const merged = mergeRows(rows, current)
  if (!sameRows(merged, rows)) setRows(merged)
  const removeRow = (key: string) =>
    setRows((entries) =>
      entries.filter((entry) => entry.present || entry.key !== key)
    )

  return merged.map((entry) => (
    <SectionRow
      key={entry.key}
      rowKey={entry.key}
      present={entry.present}
      animateIn={entry.animateIn}
      onExited={removeRow}
    >
      {entry.element}
    </SectionRow>
  ))
}

const Section: React.FC<PropsWithChildren<Props>> = ({
  children,
  style,
  animateRows = true,
  ...props
}) => {
  const theme = useTheme()
  const layout = useInputLayout()

  return (
    <View
      style={[
        {
          borderColor: theme.colors.border,
          borderWidth:
            layout === 'settings' ? inputLayout.sectionBorderWidth : 0,
          borderRadius: theme.numbers.borderRadiusLg,
          backgroundColor:
            layout === 'drawer'
              ? 'transparent'
              : theme.colors.backgroundLighter,
          padding: 0,
          gap: layout === 'drawer' ? drawerLayout.rowGap : 0,
          overflow: 'hidden',
        },
        style,
      ]}
      {...props}
    >
      {animateRows ? <SectionRows>{children}</SectionRows> : children}
    </View>
  )
}

export default Section
