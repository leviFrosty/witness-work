import { type ReactElement, useEffect, useRef } from 'react'
import { GestureDetector, type GestureType } from 'react-native-gesture-handler'

export default function LiftDetector({
  gesture,
  onUnmount,
  children,
}: {
  gesture: GestureType | null
  onUnmount?: () => void
  children: ReactElement
}) {
  const latest = useRef(onUnmount)
  useEffect(() => {
    latest.current = onUnmount
  })
  useEffect(() => () => latest.current?.(), [])
  return gesture ? (
    <GestureDetector gesture={gesture}>{children}</GestureDetector>
  ) : (
    children
  )
}
