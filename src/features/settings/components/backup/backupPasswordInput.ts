import type { TextInputProps } from '@/components/ui/TextInput'

/**
 * A backup password field: hidden, typed exactly as entered, and kept out of
 * the system's password AutoFill, which would offer to save it for a website.
 */
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
