declare module '*?srcset' {
    type ModuleExport = import('./dist/index.mjs').ModuleExport;

    const src: ModuleExport;
    export default src;
}
