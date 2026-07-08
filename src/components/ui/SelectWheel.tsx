import { ChevronDown as ChevronDownIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { useEffect, useRef, useState } from 'react'
import { Modal, Pressable, View } from 'react-native'
import { Picker } from '@react-native-picker/picker'
import { Sheet } from 'tamagui'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import { SelectDataItem, SelectProps } from '@/components/ui/Select'
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

  // Keep the authoritative state LOCAL to SelectWheel while the sheet is
  // open. This matters because the native event handler in PickerIOS.ios.js
  // calls two setStates back-to-back: ours (for the controlled value) and
  // its own internal `setNativeSelectedIndex`. If those two live in
  // different component subtrees (e.g. parent state + library state), React
  // commits them in separate passes — and between those passes the library
  // re-runs its reconciliation effect with a stale `selectedValue`, sees
  // disagreement, and shoves the native wheel back to the old value before
  // the fresh prop arrives. Keeping both setStates in the same subtree lets
  // React batch them into one commit, so they update together and the
  // reconciler never sees a stale state.
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
          animation='quick'
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
            {/* Only mount the native UIPickerView while the sheet is open.
                During the dismiss animation the Modal stays mounted (see the
                300ms unmount delay above), but the native UIPickerView tears
                down its backing UITableView cells. A touch landing on the
                picker in that window hit-tests freed cells and crashes with
                EXC_BAD_ACCESS in -[UIPickerView hitTest:withEvent:]
                (Sentry JW-TIME-BK). Unmounting on close removes it from the
                hit-test hierarchy before teardown. */}
            {open && (
              <Picker
                style={{ height: 216 }}
                selectedValue={draftValue}
                onValueChange={(next) => setDraftValue(String(next))}
                itemStyle={{ color: theme.colors.text }}
              >
                {items.map((item) => (
                  <Picker.Item
                    key={String(item.value)}
                    label={item.label}
                    value={String(item.value)}
                    color={theme.colors.text}
                  />
                ))}
              </Picker>
            )}
          </Sheet.Frame>
        </Sheet>
      </Modal>
    </>
  )
}

export default SelectWheel
