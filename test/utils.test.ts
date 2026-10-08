import { describe, expect, it } from 'vitest';
import { stripSrcsetQuery } from '../src/index';

describe('stripSrcsetQuery', () => {
    it('removes the srcset query', () => {
        expect(stripSrcsetQuery('/img/logo.svg?srcset')).toBe('/img/logo.svg');
    });

    it('keeps other queries', () => {
        expect(stripSrcsetQuery('/img/logo.svg?v=2&srcset')).toBe('/img/logo.svg?v=2');
    });

    it('removes a custom query', () => {
        expect(stripSrcsetQuery('/img/logo.svg?dark=1', 'dark')).toBe('/img/logo.svg');
    });

    it('leaves ids without the query untouched', () => {
        expect(stripSrcsetQuery('/img/logo.svg?v=2')).toBe('/img/logo.svg?v=2');
        expect(stripSrcsetQuery('/img/logo.svg')).toBe('/img/logo.svg');
    });
});
