// Lint for the API (Node, ES modules). Catches real mistakes; style is left to Prettier (npm run format).
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'uploads/', 'backups/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.node },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
];
