import { ChevronDown as ChevronDownIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { useEffect, useRef, useState } from 'react'
import { Modal, Pressable, View } from 'react-native'
import { Sheet } from 'tamagui'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import { SelectDataItem, SelectProps } from '@/components/ui/Select'
import WheelPicker from '@/components/ui/WheelPicker'
import i18n from '@/lib/locales'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const SelectWheel = <T,>({
  data,
  onChange,
  value,
  style,
  placeholder,
}: SelectProps<T>) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false)
  // Keep the RN Modal mounted through the Sheet's dismiss animation so it
  // can slide down instead of disappearing instantly when `open` flips false.
  const [mounted, setMounted] = useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    const t = setTimeout(() => setMounted(false), 300)
    return () => clearTimeout(t)
  }, [open])

  // Mirror Select.tsx: stringify both sides for matching, then map back to
  // the original item before invoking onChange so callers stay agnostic.
  const items = data as unknown as SelectDataItem<unknown>[]
  const stringValue =
    value === undefined || value === null ? undefined : String(value)
  const selectedLabel = items.find(
    (i) => String(i.value) === stringValue
  )?.label

  // Keep changes local until Done so opening, canceling, and committing retain
  // the same behavior as the previous native picker.
  const [draftValue, setDraftValue] = useState<string | undefined>(stringValue)
  const draftRef = useRef(draftValue)
  draftRef.current = draftValue
  const stringValueRef = useRef(stringValue)
  stringValueRef.current = stringValue

  useEffect(() => {
    if (open) setDraftValue(stringValueRef.current)
  }, [open])

  const commitToParent = (next: string | undefined) => {
    if (next === undefined) return
    const item = items.find((i) => String(i.value) === next)
    if (item) onChange(item as unknown as T)
  }

  const done = () => {
    if (draftRef.current !== stringValueRef.current) {
      commitToParent(draftRef.current)
    }
    setOpen(false)
  }

  const cancel = () => {
    setDraftValue(stringValueRef.current)
    setOpen(false)
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)}>
        <View
          style={[
            {
              backgroundColor: theme.colors.background,
              borderColor: theme.colors.border,
              borderWidth: 1,
              paddingHorizontal: 10,
              borderRadius: theme.numbers.borderRadiusSm,
              minHeight: 40,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            },
            style,
          ]}
        >
          <Text
            numberOfLines={1}
            style={{ color: theme.colors.text, fontSize: 14, flexShrink: 1 }}
          >
            {selectedLabel ?? placeholder ?? ''}
          </Text>
          <LucideIcon
            icon={ChevronDownIcon}
            color={theme.colors.text}
            size={12}
          />
        </View>
      </Pressable>

      {/* Wrap the tamagui Sheet in a RN Modal so the sheet is hosted in a new
          UIWindow. Without this, the Sheet's portal mounts behind any parent
          native modal / form sheet presentation (e.g. PlanDayScreen) and the
          wheel is invisible when tapped. */}
      <Modal
        visible={mounted}
        transparent
        statusBarTranslucent
        animationType='none'
        onRequestClose={cancel}
      >
        <Sheet
          open={open}
          modal={false}
          snapPointsMode='fit'
          onOpenChange={(next: boolean) => {
            if (!next) done()
            else setOpen(true)
          }}
          transition='quick'
          disableDrag
        >
          <Sheet.Overlay zIndex={100_000 - 1} />
          <Sheet.Frame
            backgroundColor={theme.colors.background}
            padding={0}
            paddingBottom={insets.bottom}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
              }}
            >
              <Pressable onPress={cancel} hitSlop={8}>
                <Text style={{ color: theme.colors.accent, fontSize: 16 }}>
                  {i18n.t('cancel')}
                </Text>
              </Pressable>
              <Pressable onPress={done} hitSlop={8}>
                <Text
                  style={{
                    color: theme.colors.accent,
                    fontSize: 16,
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('done')}
                </Text>
              </Pressable>
            </View>
            {open && draftValue !== undefined ? (
              <WheelPicker
                data={items.map((item) => ({
                  label: item.label,
                  value: String(item.value),
                }))}
                value={draftValue}
                onValueChange={setDraftValue}
              />
            ) : null}
          </Sheet.Frame>
        </Sheet>
      </Modal>
    </>
  )
}

export default SelectWheel
