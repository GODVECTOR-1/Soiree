import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import jsxA11y from 'eslint-plugin-jsx-a11y'

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'] },
  // App code: small functions, flat branching, no nested ternaries, no non-null or type assertions.
  {
    files: [
      'app/**/*.{ts,tsx}',
      'components/**/*.{ts,tsx}',
      'hooks/**/*.ts',
      'lib/**/*.ts',
      'scripts/**/*.ts',
      'proxy.ts',
    ],
    rules: {
      complexity: ['error', 12],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 250, skipBlankLines: true, skipComments: true }],
      'no-nested-ternary': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      // Types come from parsing and narrowing, never from `as` (const assertions are still allowed).
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
    },
  },
  // Strict accessibility rules for the UI. Next already registers the jsx-a11y plugin, so only its rules are added.
  {
    files: ['app/**/*.tsx', 'components/**/*.tsx'],
    rules: {
      ...jsxA11y.flatConfigs.strict.rules,
      // A region that scrolls must be reachable by keyboard (axe: scrollable-region-focusable).
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['region'], tags: [] }],
      // Handlers that act need a real control; hover and focus listeners that only pause motion are fine
      // (the same handler list as the Airbnb config).
      'jsx-a11y/no-noninteractive-element-interactions': [
        'error',
        { handlers: ['onClick', 'onMouseDown', 'onMouseUp', 'onKeyPress', 'onKeyDown', 'onKeyUp'] },
      ],
    },
  },
  // Component tests replace next/image with a plain <img>.
  { files: ['tests/**'], rules: { '@next/next/no-img-element': 'off' } },
]

export default config
