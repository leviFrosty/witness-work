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
  'iCloudSyncPausedForLapse',
  'iCloudFreshSetup',
  'hasReconciledSyncDefinitions',
  'iCloudSyncEnabled',
  'iCloudSyncSetByUser',
  'syncProvider',
  'cloudSyncOffer',
  'cloudSyncAccountToken',
  'cloudSyncConfig',
  'cloudSyncEntitled',
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

export const FRESH_SETUP_PREFERENCES = {
  iCloudFreshSetup: true,
  iCloudSyncEnabled: false,
  iCloudSyncSetByUser: true,
  iCloudSyncNeedsResolution: false,
}

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

export const SYNC_UNION_KEYS = new Set([
  'celebratedTiers',
  'celebratedMilestones',
  'homeChecklistAllDoneCelebrated',
])

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
