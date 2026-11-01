import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'] },
  // Component tests replace next/image with a plain <img>.
  { files: ['tests/**'], rules: { '@next/next/no-img-element': 'off' } },
]

export default config
