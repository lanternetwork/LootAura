// ESLint flat config for TypeScript, React, Vitest, and Testing Library
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactPlugin from 'eslint-plugin-react'
import hooksPlugin from 'eslint-plugin-react-hooks'
import testingLibrary from 'eslint-plugin-testing-library'
import vitestPlugin from 'eslint-plugin-vitest'

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    name: 'globals-and-ignores',
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'public/sw.js',
      'supabase/functions/**',
      'legacy-admin/**',
      '**/.eslintrc.*',
      '*.config.js',
      '*.config.ts',
    ],
    languageOptions: {
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        // Node globals
        process: 'readonly',
        __dirname: 'readonly',
        module: 'readonly',
      },
    },
  },

  // Base JS/TS recommendations
  js.configs.recommended,

  // TypeScript specific rules (flat)
  ...tseslint.config({
    extends: [
      ...tseslint.configs.recommended,
    ],
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: false,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      react: reactPlugin,
      'react-hooks': hooksPlugin,
    },
    rules: {
      // TS-aware: disable JS rule that conflicts with TS
      'no-undef': 'off',
      // Reduce noise that fails CI via warnings
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
    settings: {
      react: { version: 'detect' },
    },
  }),

  // React JSX in TSX
  {
    files: ['**/*.tsx'],
    plugins: { react: reactPlugin },
    rules: {
      'react/jsx-uses-react': 'off', // new JSX transform
      'react/react-in-jsx-scope': 'off',
    },
  },

  // Test environment: Vitest + Testing Library
  {
    files: ['tests/**/*.{ts,tsx}', '**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    plugins: {
      vitest: vitestPlugin,
      'testing-library': testingLibrary,
    },
    rules: {
      ...vitestPlugin.configs.recommended?.rules,
      ...testingLibrary.configs['flat/recommended']?.rules,
      'no-undef': 'off',
    },
  },
]


