# Vite Plugin SrcSet [![npm](https://img.shields.io/npm/v/vite-plugin-srcset.svg)](https://npmjs.com/package/vite-plugin-srcset)

_Vite plugin for the automatic generation of images in various formats and widths, for use in `srcsets` of [`<picture>`-](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/picture) or [`<img>`-elements](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img)._

## How it works

This plugin allows import any common image format as a srcset. While the dev server is running the srcset will only include a source with the format of the original image, but during build assets for all required formats and widths are automatically generated.

## Usage
```ts
import logoSrcset from './logo.svg?srcset' // ← Use ?srcset to import a srcset

const LOGO_SIZE = '32px';

const sources = logoSrcset.sources.map(s =>
    `<source type="${s.type}" srcset="${s.srcset}" sizes="${LOGO_SIZE}" />`
);

const renderedHTML = `
    <picture>
        ${sources.join('\n')}
        <img src="${logoSrcset.fallback}" />
    </picture>
`;
```

## Installation

Install the package:

```
npm i --save-dev vite-plugin-srcset
```

## Setup

1. Add the plugin to the Vite config:

    ```ts
    // vite.config.ts

    import { defineConfig } from 'vite';
    import srcset from 'vite-plugin-srcset';

    export default defineConfig({
        plugins: [srcset(
            {
                // config 1 (see below for list of options)
            },
            {
                // config 2 (see below for list of options)
            },
            // [...]
        )]
    });
    ```

2. If you're using Typescript, add the the client types to your `vite-env.d.ts`:
    ```patch
      /// <reference types="vite/client" />
   + /// <reference types="vite-plugin-srcset/client" />
    ```

## Configuration

This plugin allows to add multiple configs so different source images can have different combinations of output widths and formats. Each configuration may contain an `include` and an `exclude` property to determine which source images this configuration should be applied to. If a source image path matches several configurations, the first one is selected.

### Options

#### `exclude`

Type: `String` | `Array[...String]`  
Default: `null`

A [minimatch pattern](https://github.com/isaacs/minimatch), or array of patterns, which specifies the files in the build the plugin should ignore. By default no files are ignored.

#### `include`

Type: `String` | `Array[...String]`  
Default: `null`

A [minimatch pattern](https://github.com/isaacs/minimatch), or array of patterns, which specifies the files in the build the plugin should operate on. By default all files are targeted.

#### `outputFormats`

Type: `{ png?: boolean; webp?: boolean; jpeg?: boolean; avif?: boolean; jxl?: boolean; }`  
Default: `{ png: true, webp: true }`

Formats to output.

#### `outputWidths`

Type: `number[]`  
Default: `[64, 128, 256, 512, 1024]`

Widths to output.

#### `assetNamePrefix`

Type: `string`  
Default: `""`

Prefix of the name of the output assets.

#### `loadFile`

Type: `(this: PluginContext, id: string): Promise<{ contents: Uint8Array }>`  
Default: A small wrapper around `readFile` from `node:fs`

Overwrite the default file loader.

This can be useful if you want to modify or process the file before generating srcsets.
For example, you could change the fill color in an SVG from black to white:
```ts
import { stripSrcsetQuery } from 'vite-plugin-srcset';
import { normalizePath } from 'vite';

async function loadFile(id: string) {
    // id includes all search params (including srcset), which we don't care about here
    // in this example we'll strip the `srcset` as well as the `dark` query
    const fsPath = normalizePath(stripSrcsetQuery(stripSrcsetQuery(id, 'dark')));
    let text = await readFile(fsPath, 'utf-8');
    text = text.replaceAll('fill="#000000"', 'fill="#FFFFFF"');
    return { contents: Buffer.from(text, 'utf-8') };
}
```

#### `outputOptionsByFormat`

Type: `{ png?: OutputOptions<PngOptions>; webp?: OutputOptions<WebpOptions>; jpeg?: OutputOptions<JpegOptions>; avif?: OutputOptions<AvifOptions>; jxl?: OutputOptions<JxlOptions>; }`  
Default: Object with `{ effort: 4 }` for every format

This project uses [`sharp`](https://github.com/lovell/sharp) under the hood to read the original, resize and write the output images.  
This option allows you to set which [output options](https://sharp.pixelplumbing.com/api-output/#jpeg) are passed to `sharp`. These output options usually configure the compression effort, if metadata should be preserved or the output quality of the rendered image.

Each format can be either include the output options directly or a function that is passed the width and returns the options. Please check out [sharps documentation](https://sharp.pixelplumbing.com/api-output/) for a full list of options.  

Example:
```ts
// vite.config.ts

import { defineConfig } from 'vite';
import srcset from 'vite-plugin-srcset';

export default defineConfig({
    plugins: [srcset(
        {
            // [...]
            outputOptionsByFormat: {
                png: { compressionLevel: 9 },
                webp: (width) => width < 256 ? { quality: 100 } : { quality: 80 } 
            }
        },
        // [...]
    )]
});
```