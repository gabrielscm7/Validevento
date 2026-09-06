import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Data fetching idiomático (carregar em effects) é padrão em stores e
      // páginas; a regra nova do react-hooks não se aplica ao nosso fluxo.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['server.js', 'vite.config.js', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
])
