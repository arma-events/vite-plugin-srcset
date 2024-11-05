const ES_LITERAL_SYMBOL = Symbol('ESLiteral');

export type ESLiteral = string;

export function ESLiteral(x: string): ESLiteral {
    const s = new String(x);

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    s[ES_LITERAL_SYMBOL] = true;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return s;
}

export function isESLiteral(x: unknown): x is ESLiteral {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return x[ES_LITERAL_SYMBOL];
}

/**
 * Very Similar to [`JSON.stringify`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify),
 * but handles {@link ESLiteral}  and `undefined` differently.
 *
 * {@link ESLiteral} objects are just added to the string as is and without any modification.
 * This allows to include valid ECMAScript.
 *
 * @param val Value to stringify
 * @returns Stringified value
 *
 *
 * ## Example
 * ```js
 * const obj = { a: 1, b: 'test', c: new ESLiteral('test') };
 * console.log(toESString(obj))
 * // Expected output: '{"a":1,"b":"test","c":test}'
 * ```
 */
export function toESString(val: unknown): string {
    if (isESLiteral(val)) return val.toString();

    if (Array.isArray(val)) {
        return '[' + val.map(toESString).join(',') + ']';
    }

    if (val === null) return 'null';
    if (val === undefined) return 'undefined';

    if (typeof val === 'object') {
        const fields = Object.entries(val).map(([key, val]) => `${toESString(key)}:${toESString(val)}`);
        return `{${fields.join(',')}}`;
    }

    return JSON.stringify(val);
}
