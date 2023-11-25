declare module '*?srcset' {
    type ModuleExport = import('./dist/index').ModuleExport;

    const src: ModuleExport;
    export default src;
}
