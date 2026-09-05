import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'test-results/**', 'playwright-report/**', '.tool-staging/**', '.admin-restore-*/**', '.adcp-local/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
          { languageOptions: { globals: { console: 'readonly', document: 'readonly', fetch: 'readonly', FormData: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', process: 'readonly', btoa: 'readonly', atob: 'readonly', Blob: 'readonly', Option: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', ResizeObserver: 'readonly', MutationObserver: 'readonly', navigator: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly', location: 'readonly', parent: 'readonly', window: 'readonly', innerHeight: 'readonly', innerWidth: 'readonly', requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly', matchMedia: 'readonly', FileReader: 'readonly', HTMLFormElement: 'readonly', HTMLInputElement: 'readonly', HTMLSelectElement: 'readonly', Event: 'readonly' } } },
)
