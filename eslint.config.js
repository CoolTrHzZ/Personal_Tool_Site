import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { console: 'readonly', document: 'readonly', fetch: 'readonly', FormData: 'readonly', URL: 'readonly', process: 'readonly' } } },
)
