import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: ['src/index'],
    format: 'esm',
    dts: true,
    clean: true,
    fixedExtension: true,
    deps: { neverBundle: ['vite'] }
});
