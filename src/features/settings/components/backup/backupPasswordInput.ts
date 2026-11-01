import type { TextInputProps } from '@/components/ui/TextInput'

export const backupPasswordInputProps = {
  secureTextEntry: true,
  autoCapitalize: 'none',
  autoCorrect: false,
  autoComplete: 'off',
  spellCheck: false,
  textContentType: 'none',
  importantForAutofill: 'no',
  textAlign: 'start',
} satisfies Partial<TextInputProps>
