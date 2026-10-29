# WebAssembly build of Packy and Clippy

Builds `packy.js`/`packy.wasm` and `clippy.js`/`clippy.wasm` as ES modules
(`createPacky()`, `createClippy()`) exposing the same C functions the Ruby
extension calls through Fiddle.

```sh
source /path/to/emsdk/emsdk_env.sh
emcmake cmake -S . -B build-wasm -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build-wasm --target PackyWasm ClippyWasm
```

- **Clippy** is single-threaded and runs anywhere.
- **Packy** runs the solver on its own thread (`std::async`), so it is built
  with pthreads and needs `SharedArrayBuffer`: in a browser the page must be
  cross-origin isolated (`Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Embedder-Policy: require-corp`). Both modules use native
  WebAssembly exceptions (`-fwasm-exceptions`).
- The string passed to `c_optimize_start` must stay allocated until the run
  is finished: the solver thread reads it after the call has returned.

## Tests

```sh
node tools/wasm/test-clippy.mjs build-wasm/src/ladb_opencutlist/cpp/lib/Clippy
node tools/wasm/test-packy.mjs  build-wasm/src/ladb_opencutlist/cpp/lib/Packy
# Browser: copy the four files into one folder, then
node tools/wasm/serve.mjs <that folder>   # open http://localhost:8765/test.html
```
