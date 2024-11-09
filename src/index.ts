import { createFilter, normalizePath, type Plugin } from 'vite';
import { ESLiteral, toESString } from './utils/toESString';
import { readFile } from 'node:fs/promises';
import { parse } from 'node:path';
import sharp from 'sharp';
import mime from 'mime';

export interface ModuleExport {
    sources: Array<{ type: string; srcset: string }>;
    fallback: string;
    // TODO:
    // all: Record<ImageType, Record<number, string>>;
}

export function stripSrcsetQuery(id: string, query = 'srcset'): string {
    const url = new URL(id, import.meta.url);
    const oldSearch = url.search;
    url.searchParams.delete(query);
    const newSearch = url.search;

    return id.replace(oldSearch, newSearch);
}

const DEFAULT_WIDTHS = [64, 128, 256, 512, 1024];
const DEFAULT_FORMATS = { png: true, webp: true };
const DEFAULT_FILE_LOADER = (id: string): Promise<{ contents: Uint8Array }> => {
    const path = normalizePath(stripSrcsetQuery(id));
    return readFile(path).then((contents) => ({ contents }));
};

export async function renderImg(
    original: Uint8Array,
    width: number,
    format: 'png' | 'jpeg' | 'webp' | 'avif' | 'jxl'
): Promise<Uint8Array> {
    return sharp(original).resize(width)[format]({ quality: 100, lossless: true }).toBuffer();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PluginContext = ThisParameterType<Extract<Plugin['load'], (...params: any[]) => any>>;

type SrcsetPluginConfig = Array<{
    /**
     * A [picomatch pattern](https://github.com/micromatch/picomatch), or array of patterns, which
     * specifies the files in the build the plugin should operate on. By default all files are targeted.
     */
    include?: string | string[];

    /**
     * A [picomatch pattern](https://github.com/micromatch/picomatch), or array of patterns, which
     * specifies the files in the build the plugin should _ignore_. By default no files are ignored.
     */
    exclude?: string | string[];

    /**
     * Formats to output
     * @default { png: true, webp: true }
     */
    outputFormats?: {
        png?: boolean;
        webp?: boolean;
        jpeg?: boolean;
        avif?: boolean;
        jxl?: boolean;
    };

    /**
     * Widths to output
     * @default [64, 128, 256, 512, 1024]
     */
    outputWidths?: number[];

    /**
     * Prefix of the name of the output assets
     */
    assetNamePrefix?: string;

    /**
     * Overwrite the default file loader. This can be useful if you want to modify or process the file
     * before generating srcsets.
     * @param {string} id Id of file to load (includes srcset search param as well as all other search params)
     * @returns {Promise<{ contents: Uint8Array }>} A promise that resolves to the loaded file
     *
     * @example
     *     // Change fill color in SVGs from black to white:
     *     async function loadFile(id: string) {
     *           const fsPath = new URL(id, import.meta.url).pathname;
     *           let text = await readFile(fsPath, 'utf-8');
     *           text = text.replaceAll('fill="#000000"', 'fill="#FFFFFF"');
     *           return { contents: Buffer.from(text, 'utf-8') };
     *     }
     */
    loadFile?(this: PluginContext, id: string): Promise<{ contents: Uint8Array }>;
}>;

export default function srcsetPlugin(...options: SrcsetPluginConfig): Plugin {
    function findConfig(
        id: string
    ): Required<Pick<SrcsetPluginConfig[number], 'outputFormats' | 'outputWidths' | 'assetNamePrefix' | 'loadFile'>> {
        for (const { exclude, include, outputFormats, outputWidths, assetNamePrefix, loadFile } of options) {
            const filter = createFilter(include, exclude);

            if (filter(id))
                return {
                    outputFormats: outputFormats ?? DEFAULT_FORMATS,
                    outputWidths: outputWidths ?? DEFAULT_WIDTHS,
                    assetNamePrefix: assetNamePrefix ?? '',
                    loadFile: loadFile ?? DEFAULT_FILE_LOADER
                };
        }

        return {
            outputFormats: DEFAULT_FORMATS,
            outputWidths: DEFAULT_WIDTHS,
            assetNamePrefix: '',
            loadFile: DEFAULT_FILE_LOADER
        };
    }

    let viteCommand: 'build' | 'serve' = 'serve';

    return {
        name: 'srcset',
        enforce: 'pre',
        config(config, { command }) {
            viteCommand = command;
        },
        async load(id) {
            const url = new URL(id, import.meta.url);
            if (url.searchParams.get('srcset') === null) return null;

            url.searchParams.delete('srcset');
            const idWithoutParams = url.pathname;

            const normalizedId = normalizePath(stripSrcsetQuery(id));

            const config = findConfig(normalizedId);

            const { contents: original } = await config.loadFile.call(this, id);

            if (viteCommand === 'serve') {
                // we just serve the image during dev server operation

                const mimeType = mime.getType(idWithoutParams) ?? '';
                const dataURL = `data:${mimeType};base64,${Buffer.from(original).toString('base64')}`;

                return {
                    code: `const imgUrl = "${dataURL}";
    
                    export default ${toESString({
                        sources: [
                            {
                                srcset: ESLiteral(
                                    '`' + config.outputWidths.map((w) => `\${imgUrl} ${w}w`).join(', ') + '`'
                                ),
                                type: mimeType
                            }
                        ],
                        fallback: ESLiteral('imgUrl')
                    } satisfies ModuleExport)}`
                };
            }

            const widths = config.outputWidths.sort((a, b) => a - b);

            const baseName = parse(id).name;
            const getName = (width: number, format: string) =>
                `${config.assetNamePrefix}${baseName}_${width}.${format}`;

            const promises = (['avif', 'jxl', 'webp', 'jpeg', 'png'] as const)
                .filter((f) => config.outputFormats[f])
                .map(async (format) => ({
                    type: `image/${format}` as const,
                    srcset: await Promise.all(
                        widths.map(async (w) => {
                            const buffer = await renderImg(original, w, format);
                            const ref = this.emitFile({ type: 'asset', name: getName(w, format), source: buffer });

                            return { w, ref };
                        })
                    )
                }));

            const output = await Promise.all(promises);

            const fallbackRef = output.at(-1)?.srcset.at(-1)?.ref;

            if (fallbackRef === undefined) {
                this.error(`No output formats / sizes configured for ${idWithoutParams}.`);
            }

            return {
                code: `export default ${toESString({
                    sources: output.map((x) => ({
                        type: x.type,
                        srcset: ESLiteral(
                            '`' +
                                x.srcset
                                    .map(({ w, ref }) => `\${import.meta.ROLLUP_FILE_URL_${ref}} ${w}w`)
                                    .join(', ') +
                                '`'
                        )
                    })),
                    fallback: ESLiteral(`import.meta.ROLLUP_FILE_URL_${fallbackRef}`)
                } satisfies ModuleExport)}`
            };
        }
    };
}
