import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { withFcmOnDemand } = require('./with-android-fcm-on-demand')
const { AndroidConfig, XML } = require('expo/config-plugins')

const template = () =>
  XML.parseXMLAsync(
    [
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
      '  <application android:name=".MainApplication">',
      '    <meta-data android:name="expo.modules.updates.ENABLED" android:value="true"/>',
      '  </application>',
      '</manifest>',
    ].join('\n')
  )

const metaData = (manifest: unknown) =>
  Object.fromEntries(
    AndroidConfig.Manifest.getMainApplicationOrThrow(manifest)['meta-data'].map(
      (item: { $: Record<string, string> }) => [
        item.$['android:name'],
        item.$['android:value'],
      ]
    )
  )

it('keeps Firebase from registering with Google until push is asked for', async () => {
  expect(metaData(withFcmOnDemand(await template()))).toEqual({
    'expo.modules.updates.ENABLED': 'true',
    firebase_messaging_auto_init_enabled: 'false',
    firebase_analytics_collection_deactivated: 'true',
  })
})

it('is idempotent', async () => {
  const once = withFcmOnDemand(await template())
  const twice = withFcmOnDemand(structuredClone(once))
  expect(twice).toEqual(once)
})
