import { expect, it } from 'vitest';
import { version } from 'vite';

// Guards the alias of the projects in vitest.config.ts: if it silently stopped working,
// every project would test the root `vite` and this test would fail.
it(`runs against vite ${version}`, () => {
    expect(version.split('.')[0]).toBe(process.env.VITE_VERSION);
});
