import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
        XLSX: 'readonly',
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-constant-binary-expression': 'off',
      'no-empty': 'off',
    },
  },
  {
    ignores: ['dist/*', 'tests/*', 'playwright.config.js'],
  },
];
