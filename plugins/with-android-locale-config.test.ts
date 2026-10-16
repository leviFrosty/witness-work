import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { localeConfig } = require('./with-android-locale-config')

it('lists each language for Android 13+ App languages', () => {
  expect(localeConfig(['en', 'ar', 'pt-BR', 'zh-Hans'])).toBe(
    [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<locale-config xmlns:android="http://schemas.android.com/apk/res/android">',
      '  <locale android:name="en"/>',
      '  <locale android:name="ar"/>',
      '  <locale android:name="pt-BR"/>',
      '  <locale android:name="zh-Hans"/>',
      '</locale-config>',
      '',
    ].join('\n')
  )
})
