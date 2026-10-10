import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactCompiler from 'eslint-plugin-react-compiler'
import boundaries from 'eslint-plugin-boundaries'
import globals from 'globals'

const soundImports = {
  group: [
    'expo-audio',
    'expo-audio/*',
    'expo-av',
    'expo-av/*',
    '*.mp3',
    '*.wav',
    '*.caf',
    '*.m4a',
    '*.aiff',
  ],
  message: 'Register sounds in @/lib/audio and play with useSound.',
}

const hapticImports = {
  group: ['expo-haptics', 'expo-haptics/*'],
  message: 'Play haptics through @/lib/haptics.',
}

const sheetImports = {
  group: ['tamagui'],
  importNames: ['Sheet'],
  message:
    'Use Sheet from @/components/ui/Sheet, which holds takeovers while open (ADR 0021).',
}

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.cache/**',
      '.claude/**',
      '.expo/**',
      '.tamagui/**',
      'ios/**',
      'android/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'src/assets/lottie/**',
      'src/locales/**',
      'patches/**',
      'targets/**/build/**',
      // Gradle output of the local modules' Android code (e.g. unit test reports).
      'modules/*/android/build/**',
      '**/*.tar.gz',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,mts,cjs,cts}'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-compiler': reactCompiler,
      boundaries,
    },
    settings: {
      react: {
        version: '19.2',
      },
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
      'boundaries/include': ['src/**/*'],
      'boundaries/dependency-nodes': ['import'],
      'boundaries/elements': [
        {
          mode: 'full',
          type: 'app',
          capture: ['_', 'fileName'],
          pattern: [
            'src/app/**/*',
            'src/features/home/**/*',
            'src/features/settings/**/*',
            'src/features/updates/**/*',
            'src/features/onboarding/**/*',
            'src/features/plans/**/*',
            'src/features/progress/**/*',
            'src/features/log-visit/**/*',
            'src/__tests__/**/*',
          ],
        },
        {
          mode: 'full',
          type: 'feature',
          capture: ['featureName'],
          pattern: ['src/features/*/**/*'],
        },
        {
          mode: 'full',
          type: 'shared',
          pattern: [
            'src/components/**/*',
            'src/lib/**/*',
            'src/hooks/**/*',
            'src/stores/**/*',
            'src/types/**/*',
            'src/constants/**/*',
            'src/providers/**/*',
            'src/contexts/**/*',
            'src/assets/**/*',
            'src/locales/**/*',
            'src/vendor/**/*',
          ],
        },
        {
          mode: 'full',
          type: 'neverImport',
          pattern: ['src/*'],
        },
      ],
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-compiler/react-compiler': 'error',
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'none',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'boundaries/no-unknown': 'error',
      'boundaries/no-unknown-files': 'error',
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          rules: [
            {
              from: { type: 'shared' },
              allow: { to: { type: 'shared' } },
            },
            {
              from: { type: 'feature' },
              allow: [
                { to: { type: 'shared' } },
                {
                  to: {
                    type: 'feature',
                    captured: { featureName: '{{from.featureName}}' },
                  },
                },
              ],
            },
            {
              from: { type: ['app', 'neverImport'] },
              allow: {
                to: { type: ['shared', 'feature', 'app', 'neverImport'] },
              },
            },
          ],
        },
      ],
    },
  },
  // Sounds and haptics go through `@/lib/audio` and `@/lib/haptics` so the
  // Audio & Haptics settings can't be bypassed, and sheets through
  // `@/components/ui/Sheet` so they hold takeovers. Flat config replaces
  // (rather than merges) a rule's options, so each file gets one combined list.
  ...[
    { file: undefined, patterns: [soundImports, hapticImports, sheetImports] },
    { file: 'src/lib/audio.ts', patterns: [hapticImports, sheetImports] },
    { file: 'src/lib/haptics.ts', patterns: [soundImports, sheetImports] },
    {
      file: 'src/components/ui/Sheet.tsx',
      patterns: [soundImports, hapticImports],
    },
  ].map(({ file, patterns }) => ({
    files: [file ?? 'src/**/*.{js,jsx,ts,tsx}'],
    ignores: file
      ? []
      : [
          'src/lib/audio.ts',
          'src/lib/haptics.ts',
          'src/components/ui/Sheet.tsx',
          'src/__tests__/**',
        ],
    rules: { 'no-restricted-imports': ['error', { patterns }] },
  })),
  {
    files: ['src/**/*.{js,jsx,ts,tsx}', 'App.tsx', 'env.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.{js,cjs}'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.nodeBuiltin,
    },
  },
  {
    files: ['*.{ts,mts,cts}', 'scripts/**/*.{ts,mts,cts}'],
    languageOptions: {
      globals: globals.node,
    },
  }
)
