import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    // Test files are excluded from tsconfig.json, so the type-aware parser
    // can't lint them ("file was not found in any of the provided projects").
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '**/__tests__/**', '**/*.test.ts'],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      // `declare global { namespace Express { … } }` in authenticate.ts is the
      // canonical way to augment req.user — allow declaration namespaces.
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
      'no-console': 'warn',
    },
  },
];
