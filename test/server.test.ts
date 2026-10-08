import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import srcset from '../src/index';
import { FIXTURE_DIR } from './helpers';

let server: ViteDevServer;

async function serve(plugin: Plugin = srcset()): Promise<ViteDevServer> {
    server = await createServer({
        root: FIXTURE_DIR,
        configFile: false,
        logLevel: 'silent',
        server: { middlewareMode: true, watch: null },
        plugins: [plugin]
    });

    return server;
}

afterEach(() => server.close());

describe('vite dev server', () => {
    it('serves the original image as data URL for every width', async () => {
        await serve();
        const result = await server.transformRequest('/favicon.svg?srcset');

        await expect(result?.code).toMatchFileSnapshot('./snapshots/dev-favicon.svg.js');
    });

    it('serves raster images with their mime type', async () => {
        await serve();
        const result = await server.transformRequest('/pwa-192x192.png?srcset');

        await expect(result?.code).toMatchFileSnapshot('./snapshots/dev-pwa-192x192.png.js');
    });

    it('uses the outputWidths of the matching config', async () => {
        await serve(srcset({ include: '**/pwa-192x192.png', outputWidths: [10, 20] }));
        const result = await server.transformRequest('/pwa-192x192.png?srcset');

        expect(result?.code).toContain('`${imgUrl} 10w, ${imgUrl} 20w`');
    });

    it('uses the contents returned by a custom loadFile', async () => {
        const ids: string[] = [];
        const contents = Buffer.from('not really a png');
        await serve(
            srcset({
                async loadFile(id) {
                    ids.push(id);
                    return { contents };
                }
            })
        );
        const result = await server.transformRequest('/pwa-192x192.png?srcset');

        expect(ids).toEqual([`${FIXTURE_DIR}/pwa-192x192.png?srcset`]);
        // the mime type is derived from the id, not the contents
        expect(result?.code).toContain(`const imgUrl = "data:image/png;base64,${contents.toString('base64')}";`);
    });

    it('ignores requests without the srcset query', async () => {
        await serve();
        const result = await server.transformRequest('/pwa-192x192.png');

        // handled by vite's own asset plugin instead
        expect(result?.code).toMatch(/^export default "/);
        expect(result?.code).not.toContain('sources');
    });
});
