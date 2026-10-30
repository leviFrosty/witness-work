export const NON_SYNCABLE_PREFERENCE_KEYS = new Set<string>([
  'onboardingComplete',
  'prefillAddress',
  'iCloudSyncPendingPush',
  'iCloudClockOffsetMs',
  'iCloudClockCalibrated',
  'iCloudSyncIssue',
  'iCloudSyncErrorCode',
  'iCloudSyncNeedsResolution',
  'iCloudResetEpoch',
  'iCloudResetAdoptedNotice',
  'iCloudSyncDevices',
  'iCloudFreshSetup',
  'hasReconciledSyncDefinitions',
  'iCloudSyncEnabled',
  'iCloudSyncSetByUser',
  'syncProvider',
  'installedBeforeFreeSync',
  'cloudSyncTrayOffer',
  'cloudSyncOffer',
  'cloudSyncAccountToken',
  'cloudSyncConfig',
  'cloudSyncEntitled',
  'cloudSyncPhotos',
  'cloudSyncRequestAnswered',
  'iCloudSyncIncludeImages',
  'dataProtectionMode',
  'dataProtectionModeSetByUser',
  'dataProtectionRetentionPromptedAt',
  'audioEnabled',
  'hapticsEnabled',
  'iCloudImageSync',
  'lastiCloudSyncAt',
  'lastiCloudPushedAt',
  'lastiCloudPulledAt',
  'lastiCloudUploadedAt',
  'iCloudUploadPendingSince',
  'iCloudUploadIssue',
  'lastiCloudRemoteWrittenAt',
  'lastiCloudRemoteDeviceId',
  'lastiCloudRemoteDeviceName',
  'iCloudDeviceId',
  'iCloudDeviceBinding',
  'iCloudIdentityToken',
  'iCloudAccountChangedAt',
  'googleDriveAccountId',
  'googleDriveNeedsReconnect',
  'preferenceUpdatedAt',
  'hasMigratedToSyncSchema',
  'hasMigratedCustomFieldsToIds',
  'hasMigratedTagsToCategories',
  'hasMigratedProfileFromPreferences',
  'hasCollapsedLdcIntoCategory',
  // Legacy field — removed from the schema but may still exist on disk for
  // installs that pre-date the id-keyed migration. Listed here so the boot
  // cleanup that wipes it doesn't propagate the deletion through sync.
  'customContactFields',
  'devSupporterOverride',
  'devSupporterNudgeForceShow',
  'devShowAppIconAlerts',
  'developerTools',
  'hasAttemptedToMigrateToMmkv',
  'monthlyRoutineHasShownInvalidMonthAlert',
  'lastAppVersion',
  'unreadReleaseNotes',
  'calledGoecodeApiTimes',
  'lastTimeRequestedAReview',
  'lastBackupDate',
  'backupReminderSnoozedAt',
  'analyticsEnabled',
  'onboardingStepId',
  'homeChecklistCompletedAt',
  'devRolloverDateOverride',
  'devStreakOverride',
  'updateReveal',
  'contactsView',
  'activeSavedContactView',
  'mapLayer',
  'badgesBackfilledAt',
  'badgesSeenAt',
  'badgesWelcome',
  'badgeCardDismissed',
])

export const NON_SYNCABLE_PROFILE_KEYS = new Set(['profileUpdatedAt'])

/** Both onboarding fresh-start paths preserve an explicit device-local choice. */
export const FRESH_SETUP_PREFERENCES = {
  iCloudFreshSetup: true,
  iCloudSyncEnabled: false,
  iCloudSyncSetByUser: true,
  iCloudSyncNeedsResolution: false,
}

/**
 * What skipping the restore in onboarding writes. On a new install whose sync
 * never ran or was chosen, not restoring a backup isn't a choice about sync: it
 * gets the default after onboarding (ADR 0040 §2, `CloudSyncDefault`).
 * Restarting onboarding on a device that synced, or on an install from before
 * sync was free, records the off choice as it always did.
 */
export function freshSetupPreferences(state: {
  installedBeforeFreeSync: boolean
  iCloudSyncEnabled: boolean
  iCloudSyncSetByUser: boolean
  syncProvider: 'cloud' | 'platform' | null
}) {
  const neverChose =
    !state.installedBeforeFreeSync &&
    !state.iCloudSyncEnabled &&
    !state.iCloudSyncSetByUser &&
    state.syncProvider === null
  if (!neverChose) return FRESH_SETUP_PREFERENCES
  const { iCloudSyncSetByUser: _choice, ...rest } = FRESH_SETUP_PREFERENCES
  return rest
}

/** Maps are merged per entry. Missing entries with a stamp represent deletions. */
export const SYNC_MAP_KEYS = new Set([
  'monthlyGoalOverrides',
  'reportCommentOverrides',
  'publisherHours',
  'savedContactViews',
  'earnedBadges',
])
export const SYNC_SET_KEYS = new Set([
  'seenTipIds',
  'scheduleIntroCoveredPages',
  'submittedReportMonths',
  'badgeLedger',
])
/**
 * Celebrations already shown (`celebratedTiers`, `celebratedMilestones`,
 * `homeChecklistAllDoneCelebrated`). They follow the account, so a second
 * device or a restore doesn't replay fireworks the User saw elsewhere. They
 * arrive in the same payload as the records that reach them, so no Home focus
 * sees one without the other; seeding them after a restore would instead have
 * to guess which ones the User saw. A merge keeps every one either side saw
 * (true wins, lists and maps union): an older copy, or a dev Tools reset, never
 * takes one back.
 */
export const SYNC_UNION_KEYS = new Set([
  'celebratedTiers',
  'celebratedMilestones',
  'homeChecklistAllDoneCelebrated',
])

/** Union of two `SYNC_UNION_KEYS` values, in `local`'s order first. */
export function unionPreference(local: unknown, remote: unknown): unknown {
  if (typeof local === 'boolean' || typeof remote === 'boolean')
    return local === true || remote === true
  if (Array.isArray(local) || Array.isArray(remote)) {
    const list = Array.isArray(local) ? local : []
    return [
      ...list,
      ...(Array.isArray(remote) ? remote : []).filter(
        (entry) => !list.includes(entry)
      ),
    ]
  }
  const a = (local ?? {}) as Record<string, unknown>
  const b = (remote ?? {}) as Record<string, unknown>
  return Object.fromEntries(
    [...new Set([...Object.keys(a), ...Object.keys(b)])].map((key) => [
      key,
      key in a && key in b
        ? unionPreference(a[key], b[key])
        : (a[key] ?? b[key]),
    ])
  )
}

export const entryTimestampKey = (key: string, entry: string) =>
  `${key}:${entry}`

export function roleHistoryEntries(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  const history = value as {
    initial?: unknown
    changes?: Record<string, unknown>
  }
  return { initial: history.initial, ...(history.changes ?? {}) }
}

export function syncableValues(
  values: Record<string, unknown>,
  excluded: ReadonlySet<string> = NON_SYNCABLE_PREFERENCE_KEYS
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) =>
        !excluded.has(key) &&
        !['__proto__', 'constructor', 'prototype', 'set'].includes(key) &&
        typeof value !== 'function'
    )
  )
}
