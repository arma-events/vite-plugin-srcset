import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, type Plugin } from 'vite';
import sharp from 'sharp';
import type { ModuleExport } from '../src/index';

export const FIXTURE_DIR = join(import.meta.dirname, 'fixtures', 'basic');

/** The SVG favicon and the 192px icon of the arma.events web manifest, by their export name in `fixtures/basic/main.ts` */
export const FIXTURE_IMAGES = {
    favicon: 'favicon.svg',
    pwa192: 'pwa-192x192.png'
} as const;

type Output = { type: 'chunk'; code: string } | { type: 'asset'; fileName: string; source: string | Uint8Array };

export interface BuildResult {
    /** `<format> <width>x<height>` of every emitted asset by file name, sorted by file name */
    assets: Record<string, string>;
    /** Contents of every emitted asset by file name */
    assetSources: Record<string, Uint8Array>;
    /** The entry module of the build, with the asset URLs reduced to the emitted file names */
    modules: Record<keyof typeof FIXTURE_IMAGES, ModuleExport>;
}

/**
 * Build the fixture with the given plugin into a temporary directory and import the result.
 *
 * The fixture is built as a library: an app build has no use for the exports of its entry
 * and would drop the side-effect free srcset modules entirely.
 */
export async function buildFixture(plugin: Plugin): Promise<BuildResult> {
    const outDir = await mkdtemp(join(tmpdir(), 'vite-plugin-srcset-'));

    try {
        const result = await build({
            root: FIXTURE_DIR,
            configFile: false,
            logLevel: 'silent',
            plugins: [plugin],
            build: {
                outDir,
                emptyOutDir: false,
                minify: false,
                lib: { entry: 'main.ts', formats: ['es'], fileName: () => 'main.mjs' },
                rollupOptions: { output: { assetFileNames: '[name][extname]' } }
            }
        });

        // depending on the Vite version a single output or an array of outputs is returned
        const [{ output }] = (Array.isArray(result) ? result : [result]) as unknown as { output: Output[] }[];

        const assets: Record<string, string> = {};
        const assetSources: Record<string, Uint8Array> = {};
        for (const file of output
            .filter((o) => o.type === 'asset')
            .sort((a, b) => (a.fileName < b.fileName ? -1 : 1))) {
            const { format, width, height } = await sharp(file.source).metadata();
            assets[file.fileName] = `${format} ${width}x${height}`;
            assetSources[file.fileName] = Buffer.from(file.source);
        }

        const exports = (await import(pathToFileURL(join(outDir, 'main.mjs')).href)) as BuildResult['modules'];
        const modules = {} as BuildResult['modules'];
        for (const name of Object.keys(FIXTURE_IMAGES) as (keyof typeof FIXTURE_IMAGES)[]) {
            modules[name] = normalizeModule(exports[name], outDir);
        }

        return { assets, assetSources, modules };
    } finally {
        await rm(outDir, { recursive: true, force: true });
    }
}

/**
 * Rollup (Vite 4 - 7) resolves `import.meta.ROLLUP_FILE_URL_*` to `new URL('<file>', import.meta.url).href`,
 * Rolldown (Vite 8) to `'<base><file>'`. Reduce both to the emitted file name.
 */
function toFileName(url: string, outDir: string): string {
    const outDirUrl = pathToFileURL(outDir).href + '/';
    if (url.startsWith(outDirUrl)) return url.slice(outDirUrl.length);
    if (url.startsWith('/')) return url.slice(1);

    throw new Error(`Unexpected asset URL: ${url}`);
}

function normalizeModule({ sources, fallback }: ModuleExport, outDir: string): ModuleExport {
    return {
        sources: sources.map(({ type, srcset }) => ({
            type,
            srcset: srcset
                .split(', ')
                .map((candidate) => {
                    const [url, descriptor] = candidate.split(' ');
                    return `${toFileName(url, outDir)} ${descriptor}`;
                })
                .join(', ')
        })),
        fallback: toFileName(fallback, outDir)
    };
}

/** Serialize a build result for a file snapshot */
export function serialize({ assets, modules }: BuildResult): string {
    return JSON.stringify({ assets, modules }, null, 4) + '\n';
}
