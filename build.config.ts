import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
    entries: ['src/index'],
    clean: true,
    externals: ['vite'],
    declaration: true,
    rollup: {
        emitCJS: true,
        output: {
            exports: 'named'
        }
    }
});
