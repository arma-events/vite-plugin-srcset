import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    eslintPluginPrettierRecommended,
    {
        rules: {
            'no-console': 'error'
        }
    },
    ...tseslint.configs.recommended
);
