import { RuleTester } from 'eslint'
import tseslint from 'typescript-eslint'
import { describe, it } from 'vitest'
import plugin from './witnesswork.mjs'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
})

describe('witnesswork/platform-android-choice', () => {
  tester.run(
    'platform-android-choice',
    plugin.rules['platform-android-choice'],
    {
      valid: [
        // The web has a branch of its own.
        'const a = Platform.select({ ios: 1, android: 2, web: 3, default: 4 })',
        // A guard that leaves the web out is a choice made on purpose.
        "function f() { if (Platform.OS !== 'android') return; g() }",
        "if (x || Platform.OS !== 'android') g()",
        // Positive checks only add behavior on Android.
        "const a = Platform.OS === 'android' && g()",
        "if (Platform.OS === 'android') g()",
        // iOS-only checks leave the web out.
        "const a = Platform.OS !== 'ios' ? 1 : 2",
      ],
      invalid: [
        {
          code: "const a = Platform.OS === 'android' ? 1 : 2",
          errors: 1,
        },
        {
          code: "const a = Platform.OS !== 'android' ? 1 : 2",
          errors: 1,
        },
        {
          code: "const a = Platform.OS !== 'android'",
          errors: 1,
        },
        {
          code: "const a = 'android' === Platform.OS ? 1 : 2",
          errors: 1,
        },
        {
          code: "const a = y && Platform.OS !== 'android'",
          errors: 1,
        },
      ],
    }
  )
})
