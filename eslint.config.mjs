import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactCompiler from 'eslint-plugin-react-compiler'
import boundaries from 'eslint-plugin-boundaries'
import globals from 'globals'

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
            'src/shaders/**/*',
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
