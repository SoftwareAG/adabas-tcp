// ESLint flat config (ESLint 9+). Replaces the former .eslintrc/.eslintignore.
const globals = require('globals');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
    {
        // Build artefacts and generated declarations; previously .eslintignore.
        ignores: ['dist/**', 'coverage/**', 'built/**', '**/*.d.ts'],
    },
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            globals: { ...globals.node, ...globals.jest },
        },
    },
);
