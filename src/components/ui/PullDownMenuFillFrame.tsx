import type { ReactElement, ReactNode } from 'react'
import { View } from 'react-native'
import { hiddenFromScreenReaders } from '@/lib/screenReader'

export default function PullDownMenuFillFrame({
  measured,
  trigger,
  menu,
}: {
  measured: boolean
  trigger?: ReactElement
  menu: ReactNode
}) {
  return (
    <>
      <View
        {...hiddenFromScreenReaders}
        pointerEvents='none'
        style={{ opacity: 0 }}
      >
        {trigger}
      </View>
      <View
        pointerEvents='box-none'
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          alignItems: 'flex-start',
          justifyContent: 'center',
          opacity: measured ? 1 : 0,
        }}
      >
        {menu}
      </View>
    </>
  )
}
