/// <reference types="vite/client" />

declare module 'occt-import-js' {
  const factory: (options?: Record<string, unknown>) => Promise<any>;
  export default factory;
}

declare module 'occt-import-js/dist/occt-import-js.wasm?url' {
  const url: string;
  export default url;
}
