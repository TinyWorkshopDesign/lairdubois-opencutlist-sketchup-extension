// Smoke test for the Imagy WebAssembly module.
// Usage: node tools/wasm/test-imagy.mjs <dir containing imagy.js>
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

const dir = path.resolve(process.argv[2] ?? 'src/ladb_opencutlist/bin/wasm');
const { default: createImagy } = await import(pathToFileURL(path.join(dir, 'imagy.js')));
const m = await createImagy();

// A small RGB PNG built here, so the test needs no image file
// (Imagy reads PNG and JPEG only: the other stb_image formats are disabled).
function png(width, height) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = x * 80; raw[o + 1] = y * 120; raw[o + 2] = 200;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// c_load / c_write take file names: they go through the in-memory file system.
const withPath = (p, fn) => {
  const ptr = m.stringToNewUTF8(p);
  try { return fn(ptr); } finally { m._free(ptr); }
};
const load = (p) => withPath(p, (ptr) => m._c_load(ptr));
const write = (p) => withPath(p, (ptr) => m._c_write(ptr));
const size = () => [m._c_get_width(), m._c_get_height(), m._c_get_channels()];

console.log('Imagy version', m.UTF8ToString(m._c_version()));

m.FS.writeFile('/in.png', png(3, 2));
assert.equal(load('/in.png'), 1);
assert.deepEqual(size(), [3, 2, 3]);

m._c_rotate(90);
assert.deepEqual(size(), [2, 3, 3]);
m._c_flip_horizontal();
m._c_flip_vertical();

assert.equal(write('/out.png'), 1);
const out = m.FS.readFile('/out.png');
assert.deepEqual([...out.subarray(1, 4)], [0x50, 0x4e, 0x47]); // "PNG"

assert.equal(write('/out.jpg'), 1);
const jpg = m.FS.readFile('/out.jpg');
assert.deepEqual([...jpg.subarray(0, 2)], [0xff, 0xd8]); // JPEG SOI

m._c_clear();
assert.equal(load('/out.png'), 1);
assert.deepEqual(size(), [2, 3, 3]);
assert.equal(load('/missing.png'), 0);

console.log(`Imagy: PNG 3x2 loaded, rotated to 2x3, written as PNG (${out.length} B) and JPEG (${jpg.length} B), reloaded: all OK`);
