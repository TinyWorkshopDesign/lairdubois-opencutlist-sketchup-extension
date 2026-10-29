// Smoke test for the Packy WebAssembly module (pthreads).
// Usage: node tools/wasm/test-packy.mjs <dir containing packy.js>
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = path.resolve(process.argv[2] ?? 'src/ladb_opencutlist/bin/wasm');
const { default: createPacky } = await import(pathToFileURL(path.join(dir, 'packy.js')));
const m = await createPacky();

const call = (ptr) => JSON.parse(m.UTF8ToString(ptr));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Starts a run and polls it like the SketchUp extension does.
// The input string must stay allocated while the run is going: the
// solver thread reads it after c_optimize_start has returned.
async function optimize(input, { timeoutMs = 60000 } = {}) {
  const inputPtr = m.stringToNewUTF8(JSON.stringify(input));
  const started = performance.now();
  try {
    const start = call(m._c_optimize_start(inputPtr));
    assert.equal(start.running, true);
    let intermediate = 0;
    for (;;) {
      await sleep(50);
      const out = call(m._c_optimize_advance(start.run_id));
      if (out.running) {
        if (out.solution) intermediate++;
        assert.ok(performance.now() - started < timeoutMs, 'run timed out');
        continue;
      }
      return { out, intermediate, ms: Math.round(performance.now() - started) };
    }
  } finally {
    m._free(inputPtr);
  }
}

const IN = 25.4; // the extension passes lengths in inches
const mm = (v) => v / IN;

console.log('Packy version', m.UTF8ToString(m._c_version()));

// 1. Cut list on a 2800 x 2070 mm panel, guillotine cuts, 3 stages.
{
  const parts = [[600, 400, 6], [720, 560, 4], [1200, 300, 2]];
  const { out, ms } = await optimize({
    problem_type: 'rectangleguillotine',
    parameters: {
      length_truncate_factor: 254.0,
      optimization_mode: 'not-anytime-deterministic',
      not_anytime_tree_search_queue_size: 16,
      verbosity_level: 0,
    },
    instance: {
      objective: 'bin-packing-with-leftovers',
      parameters: {
        cut_type: 'non-exact',
        cut_thickness: mm(3.2),
        number_of_stages: 3,
        first_stage_orientation: 'horizontal',
      },
      bin_types: [{
        copies: 10, width: mm(2800), height: mm(2070), cost: 1,
        left_trim: mm(10), right_trim: mm(10), bottom_trim: mm(10), top_trim: mm(10),
      }],
      item_types: parts.map(([l, w, n]) => ({ copies: n, width: mm(l), height: mm(w), oriented: false })),
    },
  });
  assert.equal(out.error, undefined, out.error);
  const sol = out.solution;
  assert.ok(sol, 'no solution');
  const placed = sol.bins.reduce((s, b) => s + b.copies * b.items.length, 0);
  console.log(`rectangleguillotine: ${sol.number_of_bins} bin(s), ${placed}/12 parts placed, efficiency ${(sol.full_efficiency * 100).toFixed(1)}%, ${ms} ms`);
  assert.equal(placed, 12);
}

// 2. Irregular nesting: L-shaped parts on a 1000 x 600 mm sheet, anytime mode.
{
  const L = [[0, 0], [300, 0], [300, 100], [100, 100], [100, 250], [0, 250]]
    .map(([x, y]) => ({ x: mm(x), y: mm(y) }));
  const { out, intermediate, ms } = await optimize({
    problem_type: 'irregular',
    parameters: {
      length_truncate_factor: 254.0,
      optimization_mode: 'anytime',
      not_anytime_tree_search_queue_size: 16,
      verbosity_level: 0,
      time_limit: 5,
      label_offsets: true,
    },
    instance: {
      objective: 'bin-packing-with-leftovers',
      parameters: { item_item_minimum_spacing: mm(4), item_bin_minimum_spacing: mm(5), fake_trimming_y: 0 },
      bin_types: [{ copies: 5, type: 'rectangle', width: mm(1000), height: mm(600), cost: 1 }],
      item_types: [{
        copies: 6,
        shapes: [{ type: 'polygon', vertices: L, holes: [] }],
        allowed_rotations: [{ start: 0, end: 0 }, { start: 90, end: 90 }, { start: 180, end: 180 }, { start: 270, end: 270 }],
        allow_mirroring: false,
      }],
    },
  }, { timeoutMs: 30000 });
  assert.equal(out.error, undefined, out.error);
  const sol = out.solution;
  assert.ok(sol, 'no solution');
  const placed = sol.bins.reduce((s, b) => s + b.copies * b.items.length, 0);
  console.log(`irregular: ${sol.number_of_bins} bin(s), ${placed}/6 parts placed, ${intermediate} intermediate solution(s), ${ms} ms`);
  assert.equal(placed, 6);
}

// 3. Errors come back as JSON instead of crashing (C++ exception path).
{
  const { out } = await optimize({ parameters: {} });
  console.log('missing problem_type ->', out.error);
  assert.match(out.error, /problem_type/);
}

console.log('Packy: all OK');
process.exit(0); // pthread workers keep Node alive otherwise
