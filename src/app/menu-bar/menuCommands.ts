import * as Crypto from 'expo-crypto'
import { CommonActions } from '@react-navigation/native'
import i18n, { type TranslationKey } from '@/lib/locales'
import { navigationRef } from '@/features/contacts/lib/linking'
import { fetchUpdate } from '@/features/updates/lib/updates'

import { openURL } from '@/lib/links'
import { email } from '@/constants/contactInformation'
import type { SystemMenuGroup } from '../../../modules/system-menu'

export type MenuCommand =
  | 'preferences'
  | 'log_visit'
  | 'add_time'
  | 'new_contact'
  | 'new_plan'
  | 'backup_restore'
  | 'find_contact'
  | 'help_center'
  | 'whats_new'
  | 'contact_support'
  | 'check_update'

type MenuGroup = Omit<SystemMenuGroup, 'actions'> & {
  actions: { id: MenuCommand; title: string; enabled: boolean }[]
}

export function menuGroups({
  showsTimeEntry,
  checkingUpdate,
  language,
}: {
  showsTimeEntry: boolean
  checkingUpdate: boolean
  language: string
}): MenuGroup[] {
  const t = (key: TranslationKey) => i18n.t(key, { locale: language })
  const action = (id: MenuCommand, title: string, enabled = true) => ({
    id,
    title,
    enabled,
  })
  return [
    {
      id: 'application',
      title: '',
      actions: [action('preferences', t('menuBarPreferences'))],
    },
    {
      id: 'file',
      title: t('menuBarFile'),
      actions: [
        action('log_visit', t('logVisitEllipsis')),
        ...(showsTimeEntry ? [action('add_time', t('addTime'))] : []),
        action('new_contact', t('addContact')),
        action('new_plan', t('newPlan')),
        action('backup_restore', t('backupAndRestore')),
      ],
    },
    {
      id: 'edit',
      title: t('menuBarEdit'),
      actions: [action('find_contact', t('menuBarFindContact'))],
    },
    {
      id: 'help',
      title: t('menuBarHelp'),
      actions: [
        action('help_center', t('helpCenter')),
        action('whats_new', t('whatsNew')),
        action('contact_support', t('menuBarContactSupport')),
        action('check_update', t('checkForUpdate'), !checkingUpdate),
      ],
    },
  ]
}

/** Internal page links preserve the app's existing forms and confirmations. */
export async function runMenuCommand(
  command: MenuCommand,
  hasSidebar: boolean
) {
  switch (command) {
    case 'preferences':
      if (hasSidebar) {
        navigationRef.dispatch(
          CommonActions.navigate({
            name: 'Root',
            params: { screen: 'Settings' },
            pop: true,
          })
        )
      } else {
        navigationRef.navigate('SettingsMenu')
      }
      break
    case 'log_visit':
      navigationRef.navigate('Log Visit')
      break
    case 'add_time':
      navigationRef.navigate('Add Time')
      break
    case 'new_contact':
      navigationRef.navigate('Contact Form', { id: Crypto.randomUUID() })
      break
    case 'new_plan':
      navigationRef.navigate('PlanDay', {})
      break
    case 'backup_restore':
      navigationRef.navigate('Import and Export')
      break
    case 'find_contact':
      navigationRef.dispatch(
        CommonActions.navigate({
          name: 'Root',
          pop: true,
          params: {
            screen: 'Contacts',
            params: { view: 'list', focusSearch: true },
          },
        })
      )
      break
    case 'help_center':
      navigationRef.navigate('FAQ')
      break
    case 'whats_new':
      navigationRef.navigate('Whats New')
      break
    case 'contact_support':
      await openURL(`mailto:${email}`)
      break
    case 'check_update':
      return fetchUpdate(() => navigationRef.navigate('Update'))
  }
}
