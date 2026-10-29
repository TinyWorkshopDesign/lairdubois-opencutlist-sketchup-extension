// Smoke test for the Meshy WebAssembly module.
// Usage: node tools/wasm/test-meshy.mjs <dir containing meshy.js>
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = path.resolve(process.argv[2] ?? 'src/ladb_opencutlist/bin/wasm');
const { default: createMeshy } = await import(pathToFileURL(path.join(dir, 'meshy.js')));
const m = await createMeshy();

function operate(input) {
  const ptr = m.stringToNewUTF8(JSON.stringify(input));
  try {
    return JSON.parse(m.UTF8ToString(m._c_operate(ptr)));
  } finally {
    m._free(ptr);
  }
}

// Axis-aligned box as the flat arrays Meshy reads, outward winding.
function box([x0, y0, z0], [x1, y1, z1], faceId = 0) {
  const v = [];
  for (const z of [z0, z1]) for (const y of [y0, y1]) for (const x of [x0, x1]) v.push(x, y, z);
  const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
  const f = quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]);
  return { vertices: v, face_indices: f, face_ids: Array(f.length / 3).fill(faceId), tolerance: 1e-6 };
}

// Signed volume of a fragment (inner void shells are wound inward, so they subtract).
function volume(fragment) {
  const v = fragment.vertices, f = fragment.face_indices;
  let vol = 0;
  for (let i = 0; i < f.length; i += 3) {
    const [a, b, c] = [f[i], f[i + 1], f[i + 2]].map((k) => [v[3 * k], v[3 * k + 1], v[3 * k + 2]]);
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return vol;
}

const near = (a, b) => Math.abs(a - b) < 1e-6;
const A = box([0, 0, 0], [10, 10, 10], 1);
const B = box([5, 5, 5], [15, 15, 15], 2);

console.log('Meshy version', m.UTF8ToString(m._c_version()));

for (const [operation, expected] of [['union', 1875], ['subtraction', 875], ['intersection', 125]]) {
  const out = operate({ operation, tolerance: 1e-6, src_meshes: [A], cut_meshes: [B] });
  assert.equal(out.error, undefined, out.error);
  assert.equal(out.fragments.length, 1, `${operation}: ${out.fragments.length} fragments`);
  const vol = volume(out.fragments[0]);
  assert.ok(near(vol, expected), `${operation}: volume ${vol}, expected ${expected}`);
  const ids = new Set(out.fragments[0].face_ids);
  console.log(`${operation}: volume ${vol.toFixed(3)}, ${out.fragments[0].num_faces} triangles, face ids ${[...ids].join(',')}`);
}

// A cube with a closed internal void stays hollow (its inner shell comes back in the same fragment).
{
  const out = operate({ operation: 'subtraction', tolerance: 1e-6, src_meshes: [A], cut_meshes: [box([2, 2, 2], [8, 8, 8], 3)] });
  assert.equal(out.fragments.length, 1);
  const vol = volume(out.fragments[0]);
  assert.ok(near(vol, 1000 - 216), `hollow: volume ${vol}`);
  console.log(`hollow cube: volume ${vol.toFixed(3)} (void kept)`);
}

// Cutting a bar in two gives two fragments.
{
  const bar = box([0, 0, 0], [30, 5, 5], 1);
  const out = operate({ operation: 'subtraction', tolerance: 1e-6, src_meshes: [bar], cut_meshes: [box([14, -1, -1], [16, 6, 6], 2)] });
  assert.equal(out.fragments.length, 2);
  const vols = out.fragments.map(volume).sort((a, b) => a - b);
  assert.ok(near(vols[0], 350) && near(vols[1], 350), `split volumes ${vols}`);
  console.log(`split bar: ${out.fragments.length} fragments of ${vols.map((x) => x.toFixed(1)).join(' + ')}`);
}

// Bad input comes back as an error, not a crash.
{
  const out = operate({ operation: 'union', src_meshes: [{ vertices: [0, 0], face_indices: [] }] });
  console.log('bad mesh ->', out.error);
  assert.ok(out.error);
}

console.log('Meshy: all OK');
