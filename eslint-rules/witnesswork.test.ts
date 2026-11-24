import { RuleTester, type Rule } from 'eslint'
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
    plugin.rules['platform-android-choice'] as Rule.RuleModule,
    {
      valid: [
        'const a = Platform.select({ ios: 1, android: 2, web: 3, default: 4 })',

        "function f() { if (Platform.OS !== 'android') return; g() }",
        "if (x || Platform.OS !== 'android') g()",

        "const a = Platform.OS === 'android' && g()",
        "if (Platform.OS === 'android') g()",

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

describe('witnesswork/no-direct-linking-open-url', () => {
  tester.run(
    'no-direct-linking-open-url',
    plugin.rules['no-direct-linking-open-url'] as Rule.RuleModule,
    {
      valid: [
        "import { openURL } from '@/lib/links'; openURL('https://example.com')",
        "import * as Linking from 'expo-linking'; Linking.parse('https://example.com')",
        "import { Linking } from 'react-native'; Linking.openSettings()",
      ],
      invalid: [
        {
          code: "import * as Linking from 'expo-linking'; Linking.openURL('https://example.com')",
          errors: 1,
        },
        {
          code: "import { openURL } from 'expo-linking'; openURL('https://example.com')",
          errors: 1,
        },
        {
          code: "import { Linking } from 'react-native'; Linking.openURL('https://example.com')",
          errors: 1,
        },
        {
          code: "import { Linking as RNLinking } from 'react-native'; RNLinking.openURL('https://example.com')",
          errors: 1,
        },
      ],
    }
  )
})
