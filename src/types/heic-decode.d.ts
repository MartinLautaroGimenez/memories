declare module 'heic-decode' {
  type Decoded = { width: number; height: number; data: Uint8ClampedArray };
  function decode(opts: { buffer: ArrayBufferLike | Uint8Array }): Promise<Decoded>;
  namespace decode {
    function all(opts: { buffer: ArrayBufferLike | Uint8Array }): Promise<Array<{ width: number; height: number; decode(): Promise<Decoded> }>>;
  }
  export default decode;
}
