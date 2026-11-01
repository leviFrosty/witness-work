import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactCompiler from 'eslint-plugin-react-compiler'
import boundaries from 'eslint-plugin-boundaries'
import globals from 'globals'
import { noComments } from './scripts/lib/source-comments.mjs'

const soundImports = {
  group: [
    'expo-audio',
    'expo-audio/*',
    'expo-av',
    'expo-av/*',
    '**/modules/sound-effects',
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

const sheetMessage =
  'Use Sheet from @/components/ui/Sheet, which holds takeovers while open (ADR 0021).'
const sheetImports = [
  { group: ['tamagui'], importNames: ['Sheet'], message: sheetMessage },
  {
    group: ['@expo/ui', '@expo/ui/swift-ui'],
    importNames: ['BottomSheet'],
    message: sheetMessage,
  },
  {
    group: ['@expo/ui/jetpack-compose'],
    importNames: ['ModalBottomSheet'],
    message: sheetMessage,
  },
  { group: ['@expo/ui/community/bottom-sheet'], message: sheetMessage },
]

const persistImports = {
  group: ['zustand/middleware'],
  importNames: ['persist'],
  message:
    "Use persist from @/stores/persist, which never writes over saved data it couldn't load.",
}

const mileageStoreImports = {
  group: ['@/stores/mileage'],
  message:
    'Read mileage through @/stores/mileageView and write it through @/stores/mileageWrites, which include Shared Cars.',
}

const mileageStoreFiles = [
  'src/stores/mileageView.ts',
  'src/stores/mileageWrites.ts',
  'src/stores/noteImages.ts',
  'src/app/sync/**',

  'src/app/sharedCars/sharedCarsService.ts',
  'src/lib/backupFile.ts',
  'src/app/dev-harness/**',
  'src/app/navigation/ToolsScreen.tsx',
  'src/**/__tests__/**',
  'src/**/*.test.{ts,tsx}',
]

const directionalIconNames = [
  'ArrowBigLeft',
  'ArrowBigLeftDash',
  'ArrowBigRight',
  'ArrowBigRightDash',
  'ArrowLeft',
  'ArrowLeftFromLine',
  'ArrowLeftToLine',
  'ArrowRight',
  'ArrowRightFromLine',
  'ArrowRightToLine',
  'ChevronFirst',
  'ChevronLast',
  'ChevronLeft',
  'ChevronRight',
  'ChevronsLeft',
  'ChevronsRight',
  'CircleArrowLeft',
  'CircleArrowRight',
  'CircleChevronLeft',
  'CircleChevronRight',
  'CornerDownLeft',
  'CornerDownRight',
  'CornerUpLeft',
  'CornerUpRight',
  'Forward',
  'IndentDecrease',
  'IndentIncrease',
  'List',
  'ListChecks',
  'ListIndentDecrease',
  'ListIndentIncrease',
  'ListOrdered',
  'LogIn',
  'LogOut',
  'MoveLeft',
  'MoveRight',
  'PanelLeft',
  'PanelLeftClose',
  'PanelLeftDashed',
  'PanelLeftOpen',
  'PanelRight',
  'PanelRightClose',
  'PanelRightDashed',
  'PanelRightOpen',
  'PanelsLeftBottom',
  'PanelsRightBottom',
  'PanelsTopLeft',
  'Redo',
  'Redo2',
  'RedoDot',
  'Reply',
  'ReplyAll',
  'SquareArrowLeft',
  'SquareArrowRight',
  'SquareChevronLeft',
  'SquareChevronRight',
  'Undo',
  'Undo2',
  'UndoDot',
]
const directionalIconMessage =
  'Use the reading-direction icons in @/components/ui/DirectionalIcon (ChevronForwardIcon, ArrowBackwardIcon, …), which mirror in right-to-left layouts.'
const directionalIconImports = {
  group: ['lucide-react-native', 'lucide-react-native/*'],

  importNames: directionalIconNames.flatMap((name) => [
    name,
    `${name}Icon`,
    `Lucide${name}`,
  ]),
  message: directionalIconMessage,
}

const kebab = (name) =>
  name
    .replace(/([a-z])([A-Z0-9])/g, '$1-$2')
    .replace(/([0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
const directionalIconFiles = {
  group: directionalIconNames.flatMap((name) =>
    ['lucide-react-native/icons', 'lucide-react-native/dist/*/icons'].flatMap(
      (dir) => [`${dir}/${kebab(name)}`, `${dir}/${kebab(name)}.*`]
    )
  ),
  message: directionalIconMessage,
}

const physicalCornerRadius = '/^border(Top|Bottom)(Left|Right)Radius$/'

const physicalBorderSide = '/^border(Left|Right)(Width|Color)$/'

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.cache/**',
      '.claude/**',
      '.expo/**',
      '.hot-updater/**',
      '.verify/**',
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

      'modules/*/android/build/**',
      '**/*.tar.gz',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,mts,cjs,cts}'],
    linterOptions: { noInlineConfig: true },
    plugins: { source: { rules: { 'no-comments': noComments } } },
    rules: {
      'source/no-comments': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    },
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

            'src/features/scribe/**/*',
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

  ...[
    {
      files: undefined,
      patterns: [
        soundImports,
        hapticImports,
        ...sheetImports,
        directionalIconImports,
        directionalIconFiles,
        persistImports,
        mileageStoreImports,
      ],
    },
    {
      files: ['src/lib/audio.ts'],
      patterns: [
        hapticImports,
        ...sheetImports,
        directionalIconImports,
        directionalIconFiles,
        persistImports,
        mileageStoreImports,
      ],
    },
    {
      files: ['src/lib/haptics.ts'],
      patterns: [
        soundImports,
        ...sheetImports,
        directionalIconImports,
        directionalIconFiles,
        persistImports,
        mileageStoreImports,
      ],
    },
    {
      files: ['src/components/ui/NativeSheet*.tsx'],
      patterns: [
        soundImports,
        hapticImports,
        directionalIconImports,
        directionalIconFiles,
        persistImports,
        mileageStoreImports,
      ],
    },
    {
      files: ['src/components/ui/DirectionalIcon.tsx'],
      patterns: [
        soundImports,
        hapticImports,
        ...sheetImports,
        persistImports,
        mileageStoreImports,
      ],
    },
    {
      files: ['src/stores/persist.ts'],
      patterns: [
        soundImports,
        hapticImports,
        ...sheetImports,
        directionalIconImports,
        directionalIconFiles,
        mileageStoreImports,
      ],
    },
    {
      files: mileageStoreFiles,
      patterns: [
        soundImports,
        hapticImports,
        ...sheetImports,
        directionalIconImports,
        directionalIconFiles,
        persistImports,
      ],
    },
  ].map(({ files, patterns }) => ({
    files: files ?? ['src/**/*.{js,jsx,ts,tsx}'],

    ignores: files
      ? ['src/__tests__/**']
      : [
          'src/lib/audio.ts',
          'src/lib/haptics.ts',
          'src/components/ui/NativeSheet*.tsx',
          'src/components/ui/DirectionalIcon.tsx',
          'src/stores/persist.ts',
          ...mileageStoreFiles,
          'src/__tests__/**',
        ],
    rules: { 'no-restricted-imports': ['error', { patterns }] },
  })),

  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    ignores: ['src/__tests__/**', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Property:matches([key.name='textAlign'], [key.value='textAlign']) Literal[value=/^(left|right)$/]",
          message:
            "Use alignText('start'|'end') or alignInput(...) from @/lib/direction instead of a physical textAlign.",
        },
        {
          selector:
            "JSXAttribute[name.name='textAlign'] Literal[value=/^(left|right)$/]",
          message:
            "Use textAlign='start'|'end' (TextInput) or alignText(...) from @/lib/direction instead of a physical textAlign.",
        },
        {
          selector: `Property:matches([key.name=${physicalCornerRadius}], [key.value=${physicalCornerRadius}])`,
          message:
            'Use border(Top|Bottom)(Start|End)Radius, which mirror in right-to-left layouts.',
        },
        {
          selector: `JSXAttribute[name.name=${physicalCornerRadius}]`,
          message:
            'Use border(Top|Bottom)(Start|End)Radius, which mirror in right-to-left layouts.',
        },
        {
          selector: `Property:matches([key.name=${physicalBorderSide}], [key.value=${physicalBorderSide}])`,
          message:
            'Use border(Start|End)(Width|Color), which mirror in right-to-left layouts.',
        },
        {
          selector:
            "ObjectExpression > Property:matches([key.name='letterSpacing'], [key.value='letterSpacing']):not([value.type='Literal'][value.value=0]):not([value.type='CallExpression'][value.callee.name='tracking']):not([value.type='Identifier'][value.name='undefined'])",
          message:
            'Wrap letter spacing in tracking() from @/lib/tracking; it drops spacing in joined scripts such as Arabic.',
        },
        {
          selector:
            "JSXAttribute[name.name='letterSpacing']:not([value.expression.type='Literal'][value.expression.value=0]):not([value.expression.type='CallExpression'][value.expression.callee.name='tracking'])",
          message:
            'Wrap letter spacing in tracking() from @/lib/tracking; it drops spacing in joined scripts such as Arabic.',
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
