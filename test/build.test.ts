import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import srcset from '../src/index';
import { buildFixture, FIXTURE_DIR, FIXTURE_IMAGES, serialize } from './helpers';

describe('vite build', () => {
    it('emits png and webp assets in the default widths', async () => {
        const result = await buildFixture(srcset());

        await expect(serialize(result)).toMatchFileSnapshot('./snapshots/build-default.json');
    });

    it('applies outputFormats, outputWidths and assetNamePrefix', async () => {
        const result = await buildFixture(
            srcset({
                outputFormats: { avif: true, jpeg: true },
                // widths are emitted in ascending order, the largest one is the fallback
                outputWidths: [48, 24],
                assetNamePrefix: 'img-'
            })
        );

        await expect(serialize(result)).toMatchFileSnapshot('./snapshots/build-options.json');
    });

    it('orders the sources by format and uses the largest image of the last format as fallback', async () => {
        const { modules } = await buildFixture(
            // the order of the options must not matter
            srcset({ outputFormats: { png: true, jpeg: true, webp: true, avif: true }, outputWidths: [16, 8] })
        );

        expect(modules.favicon.sources.map((s) => s.type)).toEqual([
            'image/avif',
            'image/webp',
            'image/jpeg',
            'image/png'
        ]);
        expect(modules.favicon.fallback).toBe('/favicon_16.png');
    });

    it('does not modify the given outputWidths', async () => {
        const outputWidths = [16, 8];
        await buildFixture(srcset({ outputFormats: { png: true }, outputWidths }));

        expect(outputWidths).toEqual([16, 8]);
    });

    it('uses the first config matching the image', async () => {
        const { assets } = await buildFixture(
            srcset(
                { include: '**/*.svg', outputFormats: { png: true }, outputWidths: [32] },
                { exclude: '**/*.svg', outputFormats: { webp: true }, outputWidths: [16] },
                // matches both images, but is never reached
                { outputFormats: { jpeg: true }, outputWidths: [8] }
            )
        );

        expect(Object.keys(assets)).toEqual(['favicon_32.png', 'pwa-192x192_16.webp']);
    });

    it('falls back to the default config when no config matches', async () => {
        const { assets } = await buildFixture(srcset({ include: '**/*.gif', outputWidths: [8] }));

        // 2 images x 2 formats x 5 widths
        expect(Object.keys(assets)).toHaveLength(2 * 2 * 5);
        expect(assets['favicon_64.png']).toBe('png 64x64');
        expect(assets['pwa-192x192_1024.webp']).toBe('webp 1024x1024');
    });

    it('emits hashed files into the assets directory in an app build', async () => {
        const { assets, modules } = await buildFixture(srcset(), {}, { hashed: true });

        expect(Object.keys(assets)).toHaveLength(2 * 2 * 5);
        for (const file of Object.keys(assets)) {
            expect(file).toMatch(/^assets\/(favicon|pwa-192x192)_\d+-[\w-]{8}\.(png|webp)$/);
        }

        for (const { sources, fallback } of Object.values(modules)) {
            for (const { srcset } of sources) {
                for (const candidate of srcset.split(', '))
                    expect(assets).toHaveProperty([candidate.split(' ')[0].slice(1)]);
            }
            expect(assets[fallback.slice(1)]).toBe('png 1024x1024');
        }
    });

    describe('asset URLs', () => {
        const options: Parameters<typeof srcset>[0] = { outputFormats: { png: true }, outputWidths: [16] };

        it('are absolute paths by default', async () => {
            const { modules } = await buildFixture(srcset(options));

            expect(modules.favicon).toEqual({
                sources: [{ type: 'image/png', srcset: '/favicon_16.png 16w' }],
                fallback: '/favicon_16.png'
            });
        });

        it('respect the base option', async () => {
            const { modules } = await buildFixture(srcset(options), { base: '/static/' });

            expect(modules.favicon.sources[0].srcset).toBe('/static/favicon_16.png 16w');
            expect(modules.favicon.fallback).toBe('/static/favicon_16.png');
        });

        it('respect an absolute base option', async () => {
            const { modules } = await buildFixture(srcset(options), { base: 'https://cdn.test/assets/' });

            expect(modules.pwa192.sources[0].srcset).toBe('https://cdn.test/assets/pwa-192x192_16.png 16w');
            expect(modules.pwa192.fallback).toBe('https://cdn.test/assets/pwa-192x192_16.png');
        });

        it('respect experimental.renderBuiltUrl', async () => {
            const { modules } = await buildFixture(srcset(options), {
                experimental: { renderBuiltUrl: (file) => `https://cdn.test/${file}` }
            });

            expect(modules.favicon.sources[0].srcset).toBe('https://cdn.test/favicon_16.png 16w');
            expect(modules.favicon.fallback).toBe('https://cdn.test/favicon_16.png');
        });
    });

    describe('images in other directories', () => {
        const options: Parameters<typeof srcset>[0] = { outputFormats: { png: true }, outputWidths: [16] };
        const entry = 'entries/dirs.ts';

        it('keeps images with the same file name apart', async () => {
            const { assets, assetSources, modules } = await buildFixture(srcset(options), {}, { entry });

            // both are named `logo_16.png`, so one of them gets a numeric suffix (which one depends on the Vite version)
            expect(Object.keys(assets)).toHaveLength(2);
            expect(modules.green.fallback).not.toBe(modules.red.fallback);
            const [green, red] = [modules.green, modules.red].map((m) => assetSources[m.fallback.slice(1)]);
            expect(Buffer.compare(green, red)).not.toBe(0);
        });

        it('emits hashed files into the assets directory in an app build', async () => {
            const { assets, modules } = await buildFixture(srcset(options), {}, { entry, hashed: true });

            const files = Object.keys(assets);
            expect(files).toHaveLength(2);
            for (const file of files) expect(file).toMatch(/^assets\/logo_16-[\w-]{8}\.png$/);
            expect(modules.green.fallback).not.toBe(modules.red.fallback);
            expect(files).toContain(modules.green.fallback.slice(1));
            expect(files).toContain(modules.red.fallback.slice(1));
            expect(modules.green.fallback).toMatch(/^\/assets\/logo_16-[\w-]{8}\.png$/);
        });

        it('puts the assetNamePrefix into the output path', async () => {
            const { assets, modules } = await buildFixture(
                srcset({ ...options, assetNamePrefix: 'icons/' }),
                { base: '/static/' },
                { entry, hashed: true }
            );

            for (const file of Object.keys(assets)) expect(file).toMatch(/^assets\/icons\/logo_16-[\w-]{8}\.png$/);
            expect(modules.green.fallback).toMatch(/^\/static\/assets\/icons\/logo_16-[\w-]{8}\.png$/);
        });
    });

    describe('outputOptionsByFormat', () => {
        async function isProgressive(image: Uint8Array): Promise<boolean | undefined> {
            return (await sharp(image).metadata()).isProgressive;
        }

        it('passes static options to sharp', async () => {
            const { assetSources } = await buildFixture(
                srcset({
                    outputFormats: { jpeg: true },
                    outputWidths: [16],
                    outputOptionsByFormat: { jpeg: { progressive: true } }
                })
            );

            expect(await isProgressive(assetSources['pwa-192x192_16.jpeg'])).toBe(true);
        });

        it('calls option functions with the width', async () => {
            const jpeg = vi.fn((width: number) => ({ progressive: width >= 32 }));

            const { assetSources } = await buildFixture(
                srcset({ outputFormats: { jpeg: true }, outputWidths: [16, 32], outputOptionsByFormat: { jpeg } })
            );

            // once per width and image
            expect(jpeg).toHaveBeenCalledTimes(2 * 2);
            expect(await isProgressive(assetSources['pwa-192x192_16.jpeg'])).toBe(false);
            expect(await isProgressive(assetSources['pwa-192x192_32.jpeg'])).toBe(true);
        });
    });

    it('uses the contents returned by a custom loadFile', async () => {
        const ids: string[] = [];
        const contexts: unknown[] = [];

        const { assets } = await buildFixture(
            srcset({
                outputFormats: { png: true },
                outputWidths: [16],
                async loadFile(id) {
                    ids.push(id);
                    contexts.push(this);
                    // 2:1 images (unlike the square icons) that differ per file, as identical assets are emitted only once
                    const background = { r: 50 * ids.length, g: 0, b: 0 };
                    const contents = await sharp({ create: { width: 8, height: 4, channels: 3, background } })
                        .png()
                        .toBuffer();
                    return { contents };
                }
            })
        );

        expect(ids.sort()).toEqual(
            Object.values(FIXTURE_IMAGES)
                .sort()
                .map((file) => `${FIXTURE_DIR}/${file}?srcset`)
        );
        expect(assets).toEqual({ 'favicon_16.png': 'png 16x8', 'pwa-192x192_16.png': 'png 16x8' });
        // `this` is the plugin context
        for (const ctx of contexts) expect(ctx).toHaveProperty('emitFile', expect.any(Function));
    });

    it('fails when no output formats are configured', async () => {
        // the images load in parallel, either one may fail first
        await expect(buildFixture(srcset({ outputFormats: {} }))).rejects.toThrow(
            /No output formats \/ sizes configured for .*\/(favicon\.svg|pwa-192x192\.png)\./
        );
    });
});
