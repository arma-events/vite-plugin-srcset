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
        expect(modules.favicon.fallback).toBe('favicon_16.png');
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
        const { assets, modules } = await buildFixture(srcset(), { hashed: true });

        expect(Object.keys(assets)).toHaveLength(2 * 2 * 5);
        for (const file of Object.keys(assets)) {
            expect(file).toMatch(/^assets\/(favicon|pwa-192x192)_\d+-[\w-]{8}\.(png|webp)$/);
        }

        for (const { sources, fallback } of Object.values(modules)) {
            for (const { srcset } of sources) {
                for (const candidate of srcset.split(', ')) expect(assets).toHaveProperty([candidate.split(' ')[0]]);
            }
            expect(assets[fallback]).toBe('png 1024x1024');
        }
    });

    it('keeps images with the same file name apart', async () => {
        const { assets, assetSources, modules } = await buildFixture(
            srcset({ outputFormats: { png: true }, outputWidths: [16] }),
            { entry: 'entries/dirs.ts' }
        );

        // both are named `logo_16.png`, so one of them gets a numeric suffix (which one depends on the Vite version)
        expect(Object.keys(assets)).toHaveLength(2);
        expect(modules.green.fallback).not.toBe(modules.red.fallback);
        const [green, red] = [modules.green, modules.red].map((m) => assetSources[m.fallback]);
        expect(Buffer.compare(green, red)).not.toBe(0);
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
