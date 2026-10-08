import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, type Plugin, type UserConfig } from 'vite';
import sharp from 'sharp';
import type { ModuleExport } from '../src/index';

export const FIXTURE_DIR = join(import.meta.dirname, 'fixtures', 'basic');

/** The SVG favicon and the 192px icon of the arma.events web manifest, by their export name in `fixtures/basic/main.ts` */
export const FIXTURE_IMAGES = {
    favicon: 'favicon.svg',
    pwa192: 'pwa-192x192.png'
} as const;

type Output =
    | { type: 'chunk'; fileName: string; isEntry: boolean }
    | { type: 'asset'; fileName: string; source: string | Uint8Array };

export interface BuildResult {
    /** `<format> <width>x<height>` of every emitted asset by file name, sorted by file name */
    assets: Record<string, string>;
    /** Contents of every emitted asset by file name */
    assetSources: Record<string, Uint8Array>;
    /** The exports of the entry module of the build */
    modules: Record<string, ModuleExport>;
}

export interface BuildOptions {
    /** Entry of the build, relative to the fixture. @default 'main.ts' */
    entry?: string;
    /** Use Vite's default asset names (`assets/<name>-<hash>.<ext>`) instead of `<name>.<ext>`. @default false */
    hashed?: boolean;
}

/**
 * Build the fixture with the given plugin into a temporary directory and import the result.
 *
 * The entry's exports are preserved (library mode or `preserveEntrySignatures`), as an app build has
 * no use for them and would drop the side-effect free srcset modules entirely.
 */
export async function buildFixture(
    plugin: Plugin,
    config: UserConfig = {},
    { entry = 'main.ts', hashed = false }: BuildOptions = {}
): Promise<BuildResult> {
    const outDir = await mkdtemp(join(tmpdir(), 'vite-plugin-srcset-'));

    try {
        const result = await build({
            root: FIXTURE_DIR,
            configFile: false,
            logLevel: 'silent',
            plugins: [plugin],
            ...config,
            build: {
                outDir,
                emptyOutDir: false,
                minify: false,
                ...(hashed
                    ? { rollupOptions: { input: join(FIXTURE_DIR, entry), preserveEntrySignatures: 'strict' } }
                    : {
                          lib: { entry, formats: ['es'], fileName: () => 'main.mjs' },
                          rollupOptions: { output: { assetFileNames: '[name][extname]' } }
                      })
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

        const entryChunk = output.find((o) => o.type === 'chunk' && o.isEntry)!;
        const modules = (await import(pathToFileURL(join(outDir, entryChunk.fileName)).href)) as BuildResult['modules'];

        return { assets, assetSources, modules };
    } finally {
        await rm(outDir, { recursive: true, force: true });
    }
}

/** Serialize a build result for a file snapshot */
export function serialize({ assets, modules }: BuildResult): string {
    return JSON.stringify({ assets, modules }, null, 4) + '\n';
}
