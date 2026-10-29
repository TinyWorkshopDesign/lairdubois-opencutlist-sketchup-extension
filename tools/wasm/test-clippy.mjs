// Smoke test for the Clippy WebAssembly module.
// Usage: node tools/wasm/test-clippy.mjs <dir containing clippy.js>
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = path.resolve(process.argv[2] ?? 'src/ladb_opencutlist/bin/wasm');
const { default: createClippy } = await import(pathToFileURL(path.join(dir, 'clippy.js')));
const m = await createClippy();

const CLIP = { INTERSECTION: 1, UNION: 2, DIFFERENCE: 3, XOR: 4 };
const FILL_NON_ZERO = 1;
const JOIN_MITER = 3;
const END_POLYGON = 0;

// Same layout as clippy.rb: a path is [n, 0, x0, y0, ...],
// a path list is [total_len, count, path, path, ...].
const cpath = (pts) => [pts.length / 2, 0, ...pts];
const cpaths = (paths) => {
  const body = paths.flatMap(cpath);
  return [body.length + 2, paths.length, ...body];
};

function alloc(values) {
  const ptr = m._malloc(values.length * 8);
  m.HEAPF64.set(values, ptr / 8);
  return ptr;
}

function readPaths(ptr) {
  if (!ptr) return [];
  const f = m.HEAPF64;
  let i = ptr / 8;
  const count = f[i + 1];
  i += 2;
  const out = [];
  for (let p = 0; p < count; p++) {
    const n = f[i];
    out.push(Array.from(f.subarray(i + 2, i + 2 + n * 2)));
    i += 2 + n * 2;
  }
  return out;
}

// CPathsDSolution on wasm32: { double* closed; double* open; int64 error }
function readSolution(sol) {
  const closed = m.HEAPU32[sol / 4];
  const open = m.HEAPU32[sol / 4 + 1];
  const error = m.HEAP32[sol / 4 + 2];
  const result = { closed: readPaths(closed), open: readPaths(open), error };
  m._c_dispose_paths_solution(sol);
  return result;
}

function area(pts) {
  const p = alloc(cpath(pts));
  const a = m._c_get_cpath_area(p);
  m._free(p);
  return Math.abs(a);
}

function boolean(type, subjects, clips) {
  const s = alloc(cpaths(subjects));
  const o = alloc(cpaths([]));
  const c = alloc(cpaths(clips));
  const sol = m._c_boolean_op(type, FILL_NON_ZERO, s, o, c);
  [s, o, c].forEach((x) => m._free(x));
  return readSolution(sol);
}

const sq = (x, y, s) => [x, y, x + s, y, x + s, y + s, x, y + s];
const a = sq(0, 0, 10);
const b = sq(5, 5, 10);
const total = (paths) => paths.reduce((sum, p) => sum + area(p), 0);

console.log('Clippy version', m.UTF8ToString(m._c_version()));

assert.equal(area(a), 100);

const union = boolean(CLIP.UNION, [a], [b]);
assert.equal(union.error, 0);
assert.equal(union.closed.length, 1);
assert.equal(total(union.closed), 175);

const diff = boolean(CLIP.DIFFERENCE, [a], [b]);
assert.equal(total(diff.closed), 75);

const inter = boolean(CLIP.INTERSECTION, [a], [b]);
assert.equal(total(inter.closed), 25);

const p = alloc(cpaths([a]));
const inflated = readSolution(m._c_inflate_paths(p, 1, JOIN_MITER, END_POLYGON, 2, 0, 0, 0));
m._free(p);
assert.ok(Math.abs(total(inflated.closed) - 144) < 1e-6, `inflate area ${total(inflated.closed)}`);

const poly = alloc(cpath(a));
assert.equal(m._c_is_point_on_polygon(10, 5, poly), 1);
assert.equal(m._c_is_point_on_polygon(5, 5, poly), 0);
m._free(poly);

console.log('Clippy: union 175, difference 75, intersection 25, inflate 144: all OK');
