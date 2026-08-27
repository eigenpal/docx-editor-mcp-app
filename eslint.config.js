// Flat config. Two things are load-bearing here and neither is style:
//
//   `max-lines` — the cap that keeps a file from growing past the point where
//   anyone reads it whole. Extract; do not raise the cap.
//
//   `no-restricted-syntax` on `innerHTML` — the widget renders text that came
//   out of a `.docx`, which is a zip of XML the sender fully controls. Every
//   HTML-from-strings sink is a place that text can stop being text.
//
// Everything else is the TypeScript recommended set.

import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'max-lines': ['error', { max: 400, skipBlankLines: false, skipComments: false }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='innerHTML']",
          message:
            'Text out of a .docx is attacker-controlled. Set textContent, or render it through React.',
        },
        {
          selector: "MemberExpression[property.name='outerHTML']",
          message:
            'Text out of a .docx is attacker-controlled. Set textContent, or render it through React.',
        },
      ],
    },
  },
  {
    files: ['src/server/__tests__/**/*.ts'],
    rules: { 'max-lines': 'off' },
  },
];
