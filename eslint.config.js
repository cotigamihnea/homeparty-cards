import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

const NO_HTML_STRINGS = 'Build DOM nodes with src/client/ui/dom.ts; never parse strings as HTML.';

export default defineConfig([
    globalIgnores([
        'dist/',
        'release/',
        'coverage/',
        'test-results/',
        'playwright-report/',
        '.playwright-mcp/',
        '.superpowers/',
    ]),
    js.configs.recommended,
    tseslint.configs.recommended,
    prettier,
    {
        rules: {
            'no-restricted-properties': [
                'error',
                { property: 'innerHTML', message: NO_HTML_STRINGS },
                { property: 'outerHTML', message: NO_HTML_STRINGS },
                { property: 'insertAdjacentHTML', message: NO_HTML_STRINGS },
            ],
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        },
    },
]);
