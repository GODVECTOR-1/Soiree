import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'] },
  // Size and complexity limits for app code: small functions, flat branching, no nested ternaries.
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
    },
  },
  // Component tests replace next/image with a plain <img>.
  { files: ['tests/**'], rules: { '@next/next/no-img-element': 'off' } },
]

export default config
