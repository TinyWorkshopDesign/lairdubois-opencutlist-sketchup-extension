# WebAssembly build of the native libraries

Builds Packy, Clippy, Meshy and Imagy as ES modules (`packy.js` + `packy.wasm`,
… with factories `createPacky()`, `createClippy()`, `createMeshy()`,
`createImagy()`) exposing the same C functions the Ruby extension calls
through Fiddle.

```sh
source /path/to/emsdk/emsdk_env.sh
emcmake cmake -S . -B build-wasm -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build-wasm --target PackyWasm ClippyWasm MeshyWasm ImagyWasm
# the threaded Packy, for comparison
emcmake cmake -S . -B build-wasm-mt -G Ninja -DCMAKE_BUILD_TYPE=Release -DOCL_WASM_PTHREADS=ON
cmake --build build-wasm-mt --target PackyWasm
```

- **Clippy**, **Meshy** (Manifold, without its parallel backend) and **Imagy**
  are single-threaded and run anywhere.
- **Imagy**'s `c_load`/`c_write` take file names: write the PNG/JPEG bytes
  into the module's in-memory file system (`Module.FS.writeFile`) and read the
  result back with `Module.FS.readFile`.
- **Packy** is single-threaded by default: no pthreads and no
  `SharedArrayBuffer`, so it loads in any page or Worker, cross-origin isolated
  or not. `c_optimize_start` computes the whole run before it returns, and the
  first `c_optimize_advance` answers the final output. The call protocol is
  the same as the threaded build's, so a host polls both the same way. What
  changes:
  - PackingSolver runs its algorithms one after the other
    (`optimization_mode` is forced to `not-anytime-sequential`), and the
    pre-process uses one thread;
  - there are no intermediate solutions, and `c_optimize_cancel` can't stop a
    run that is computing: the host cancels by terminating the Worker;
  - for parallelism, a host runs several modules in several Workers, one run
    each (`bench-packy.mjs` measures this).
- `-DOCL_WASM_PTHREADS=ON` builds the threaded Packy instead: the solver runs
  on its own thread (`std::async`), so it needs `SharedArrayBuffer`. In a
  browser the page must be cross-origin isolated
  (`Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Embedder-Policy: require-corp`). In that build the string
  passed to `c_optimize_start` must stay allocated until the run is finished:
  the solver thread reads it after the call has returned.
- Both modules use native WebAssembly exceptions (`-fwasm-exceptions`).

## Tests

```sh
node tools/wasm/test-clippy.mjs build-wasm/src/ladb_opencutlist/cpp/lib/Clippy
node tools/wasm/test-packy.mjs  build-wasm/src/ladb_opencutlist/cpp/lib/Packy
node tools/wasm/bench-packy.mjs build-wasm/src/ladb_opencutlist/cpp/lib/Packy --workers 4
node tools/wasm/test-meshy.mjs  build-wasm/src/ladb_opencutlist/cpp/lib/Meshy
node tools/wasm/test-imagy.mjs  build-wasm/src/ladb_opencutlist/cpp/lib/Imagy
# Browser: copy the .js/.wasm files into one folder, then
node tools/wasm/serve.mjs <that folder>   # open http://localhost:8765/test.html
# The single-threaded Packy in four module Workers, on a page that is NOT
# cross-origin isolated (as a host that can't isolate its pages):
node tools/wasm/serve.mjs <dir with packy.js> --no-isolation   # open http://localhost:8765/test-worker.html
```

## Single-threaded vs threaded Packy

`bench-packy.mjs` on Linux arm64 (10 cores), Node 26, Emscripten 7.0.0,
four generated problems (three guillotine sheet jobs and one bar job):

| | single-threaded | threaded |
|---|---:|---:|
| Same bins and efficiency on every problem | yes | yes |
| One run at a time, all four problems | 4.6 s | 3.7–4.1 s |
| Bar job alone | 8 ms | ~75 ms (thread start-up) |
| 16 runs on 4 Workers | 6.4 s (18.5 s one at a time) | crashes (`WebAssembly.Exception`) |
| 32 runs on 8 Workers | 6.7 s (37 s one at a time) | — |

`test-worker.html` without cross-origin isolation (no `SharedArrayBuffer`):
four Workers, all results right, in Chromium (0.5 s) and WebKitGTK 4.1
MiniBrowser (1.2 s).
