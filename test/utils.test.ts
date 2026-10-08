import { describe, expect, it } from 'vitest';
import { stripSrcsetQuery } from '../src/index';
import { ESLiteral, toESString } from '../src/utils/toESString';

describe('toESString', () => {
    it('stringifies primitives like JSON.stringify', () => {
        expect(toESString(1)).toBe('1');
        expect(toESString('a"b')).toBe('"a\\"b"');
        expect(toESString(true)).toBe('true');
    });

    it('stringifies arrays and objects recursively', () => {
        expect(toESString({ a: [1, 'b', { c: 'd' }], e: {} })).toBe('{"a":[1,"b",{"c":"d"}],"e":{}}');
    });

    it('inserts ESLiteral values verbatim', () => {
        expect(toESString({ url: ESLiteral('import.meta.url'), list: [ESLiteral('`${a} 1w`')] })).toBe(
            '{"url":import.meta.url,"list":[`${a} 1w`]}'
        );
    });
});

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
