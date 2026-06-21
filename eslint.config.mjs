import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['dist/**', 'out/**', 'node_modules/**', '.wdio-vscode/**'],
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
  })),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: ['vscode', 'react', 'react-dom', 'react-dom/client'],
        patterns: [{
          group: [
            '../protocol/**', '../../protocol/**', '../../../protocol/**', '../../../../protocol/**',
            '../extension/**', '../../extension/**', '../../../extension/**', '../../../../extension/**',
            '../webview/**', '../../webview/**', '../../../webview/**', '../../../../webview/**',
            '@application/**', '@protocol/**', '@extension/**', '@webview/**',
          ],
          message: 'Core must stay independent from protocol, extension, and webview layers.',
        }],
      }],
    },
  },
  {
    files: ['src/protocol/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: ['vscode', 'react', 'react-dom', 'react-dom/client'],
        patterns: [{
          group: [
            '../core/**', '../../core/**', '../../../core/**', '../../../../core/**',
            '../extension/**', '../../extension/**', '../../../extension/**', '../../../../extension/**',
            '../webview/**', '../../webview/**', '../../../webview/**', '../../../../webview/**',
            '@core/**', '@application/**', '@extension/**', '@webview/**',
          ],
          message: 'Protocol must contain serializable contracts only.',
        }],
      }],
    },
  },
  {
    files: ['src/webview/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: ['vscode'],
        patterns: [{
          group: [
            '../core/**', '../../core/**', '../../../core/**', '../../../../core/**',
            '../extension/**', '../../extension/**', '../../../extension/**', '../../../../extension/**',
            '@core/**', '@application/**', '@extension/**',
          ],
          message: 'Webview code may depend on protocol and webview modules only, not core or extension.',
        }],
      }],
    },
  },
  {
    files: ['src/**/*.stories.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/extension/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['../webview/**', '../../webview/**', '../../../webview/**', '../../../../webview/**', '@webview/**'],
          message: 'Extension adapters must not import React/webview implementation code.',
        }],
      }],
    },
  },
];
