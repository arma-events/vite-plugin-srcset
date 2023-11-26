import { createFilter, type Plugin } from 'vite';
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

const DEFAULT_WIDTHS = [64, 128, 256, 512, 1024];
const DEFAULT_FORMATS = { png: true, webp: true };

export const SUFFIX = '?srcset';

export async function renderImg(
    original: Buffer,
    width: number,
    format: 'png' | 'jpeg' | 'webp' | 'avif' | 'jxl'
): Promise<Uint8Array> {
    return sharp(original).resize(width)[format]({ quality: 100, lossless: true }).toBuffer();
}

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
}>;

export default function srcsetPlugin(options: SrcsetPluginConfig = []): Plugin {
    function findConfig(
        id: string
    ): Required<Pick<SrcsetPluginConfig[number], 'outputFormats' | 'outputWidths' | 'assetNamePrefix'>> {
        for (const { exclude, include, outputFormats, outputWidths, assetNamePrefix } of options) {
            const filter = createFilter(include, exclude);

            if (filter(id))
                return {
                    outputFormats: outputFormats ?? DEFAULT_FORMATS,
                    outputWidths: outputWidths ?? DEFAULT_WIDTHS,
                    assetNamePrefix: assetNamePrefix ?? ''
                };
        }

        return { outputFormats: DEFAULT_FORMATS, outputWidths: DEFAULT_WIDTHS, assetNamePrefix: '' };
    }

    let viteCommand: 'build' | 'serve' = 'serve';

    return {
        name: 'srcset',
        enforce: 'pre',
        config(config, { command }) {
            viteCommand = command;
        },
        async load(id) {
            if (!id.endsWith(SUFFIX)) return null;

            const config = findConfig(id);

            const idWithoutParams = new URL(id, import.meta.url).pathname;

            if (viteCommand === 'serve') {
                // we just serve the image during dev server operation
                return {
                    code: `import imgUrl from '${idWithoutParams}?url';
    
                    export default ${toESString({
                        sources: [
                            {
                                srcset: ESLiteral(
                                    '`' + config.outputWidths.map((w) => `\${imgUrl} ${w}w`).join(', ') + '`'
                                ),
                                type: mime.getType(idWithoutParams) ?? ''
                            }
                        ],
                        fallback: ESLiteral('imgUrl')
                    } satisfies ModuleExport)}`
                };
            }

            const widths = config.outputWidths.sort((a, b) => a - b);
            const original = await readFile(idWithoutParams);

            const baseName = parse(id).name;
            const getName = (width: number, format: string) =>
                `${config.assetNamePrefix}${baseName}_${width}.${format}`;

            const promises = (['avif', 'jxl', 'webp', 'jpeg', 'png'] as const).map(async (format) => {
                if (!config.outputFormats[format]) return undefined;

                return {
                    type: `image/${format}` as const,
                    srcset: await Promise.all(
                        widths.map(async (w) => {
                            const buffer = await renderImg(original, w, format);
                            const ref = this.emitFile({ type: 'asset', name: getName(w, format), source: buffer });

                            return { w, ref };
                        })
                    )
                };
            });

            const output = (await Promise.all(promises)).filter(
                (x): x is Exclude<Awaited<(typeof promises)[number]>, undefined> => x !== undefined
            );

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
