// Minimal static server for the browser test, with the headers that make the
// page cross-origin isolated (needed for SharedArrayBuffer, i.e. Packy's threads).
// Usage: node tools/wasm/serve.mjs <wasm dir> [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wasmDir = path.resolve(process.argv[2] ?? 'src/ladb_opencutlist/bin/wasm');
const port = Number(process.argv[3] ?? 8765);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/log') { console.log('[page]', decodeURIComponent(url.search.slice(1))); res.writeHead(204).end(); return; }
  const name = path.basename(url.pathname) || 'test.html';
  const file = [path.join(here, name), path.join(wasmDir, name)].find((f) => fs.existsSync(f));
  if (!file) { res.writeHead(404).end(); return; }
  res.writeHead(200, {
    'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}/test.html`));
