import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

/** Every supported Vite major is installed as an aliased copy (`vite4` as `npm:vite@4`, ...) */
const VITE_VERSIONS = ['4', '5', '6', '7', '8'];

/** Resolve the ESM entry point of an aliased Vite copy */
function resolveAliasedVite(version: string): string {
    const pkgDir = join(import.meta.dirname, 'node_modules', `vite${version}`);
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));

    // Vite 4: { import: string }, Vite 5: { import: { default: string } }, Vite 6: { import: string }, Vite 7+: string
    let entry = pkg.exports['.'];
    if (typeof entry !== 'string') entry = entry.import;
    if (typeof entry !== 'string') entry = entry.default;

    return join(pkgDir, entry);
}

export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        // the default reporter only lists individual tests when a file fails
        reporters: ['tree'],
        // rendering the 1024px variants with sharp takes a moment
        testTimeout: 30000,
        // The whole suite runs once per supported Vite major: the plugin's and the tests' `import ... from 'vite'`
        // are redirected to the aliased copy, Vitest itself keeps using the root `vite`.
        // Run a single one with `vitest run --project vite7`.
        projects: VITE_VERSIONS.map((version) => ({
            resolve: { alias: [{ find: /^vite$/, replacement: resolveAliasedVite(version) }] },
            test: {
                name: `vite${version}`,
                // checked by test/vite-version.test.ts
                env: { VITE_VERSION: version }
            }
        }))
    }
});
