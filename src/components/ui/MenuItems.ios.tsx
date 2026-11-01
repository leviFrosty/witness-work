import { Button, Divider, Menu, Toggle } from '@expo/ui/swift-ui'
import { Fragment } from 'react'
import { isSubmenu } from '@/components/ui/menuEntries'
import type {
  ContextMenuAction,
  ContextMenuItem,
} from '@/components/ui/ContextMenu.types'

export default function MenuItems({ groups }: { groups: ContextMenuItem[][] }) {
  const action = (item: ContextMenuAction, key: string) =>
    item.checked === undefined ? (
      <Button
        key={key}
        label={item.title}
        systemImage={item.systemImage}
        role={item.destructive ? 'destructive' : undefined}
        onPress={() => item.onPress()}
      />
    ) : (
      <Toggle
        key={key}
        label={item.title}
        systemImage={item.systemImage}
        isOn={item.checked}
        onIsOnChange={() => item.onPress()}
      />
    )

  return groups.map((group, index) => (
    <Fragment key={index}>
      {index > 0 ? <Divider /> : null}
      {group.map((item) =>
        isSubmenu(item) ? (
          <Menu key={item.id} label={item.title} systemImage={item.systemImage}>
            {item.actions.map((sub) => action(sub, `${item.id}.${sub.id}`))}
          </Menu>
        ) : (
          action(item, item.id)
        )
      )}
    </Fragment>
  ))
}
