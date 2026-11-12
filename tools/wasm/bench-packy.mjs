// Compares Packy WebAssembly builds on the same cutting problems.
// Usage: node tools/wasm/bench-packy.mjs <dir with packy.js> [--workers N] [--label name]
//
// Each problem runs once in the main thread (one run at a time), then the whole
// set runs again spread over N Workers, one module per Worker: the layout a
// host uses when the module is single-threaded. Works with both builds; the
// threaded one also starts its own pthreads inside each run.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import path from 'node:path';
import os from 'node:os';
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

const IN = 25.4;
const mm = (v) => v / IN;

// Problems shaped like OpenCutList's: guillotine sheet cutting and bar cutting.
function problems() {
  const rnd = mulberry32(42);
  const sheet = (name, n, kinds) => {
    const items = [];
    for (let i = 0; i < kinds; i++) {
      items.push({ copies: 1 + Math.floor(rnd() * (n / kinds)), width: mm(150 + Math.floor(rnd() * 1000)), height: mm(80 + Math.floor(rnd() * 600)), oriented: false });
    }
    return {
      name,
      input: {
        problem_type: 'rectangleguillotine',
        parameters: { length_truncate_factor: 254.0, optimization_mode: 'not-anytime-deterministic', not_anytime_tree_search_queue_size: 16, verbosity_level: 0 },
        instance: {
          objective: 'bin-packing-with-leftovers',
          parameters: { cut_type: 'non-exact', cut_thickness: mm(3.2), number_of_stages: 3, first_stage_orientation: 'horizontal' },
          bin_types: [{ copies: 50, width: mm(2800), height: mm(2070), cost: 1, left_trim: mm(10), right_trim: mm(10), bottom_trim: mm(10), top_trim: mm(10) }],
          item_types: items,
        },
      },
    };
  };
  const bars = (name, kinds) => ({
    name,
    input: {
      problem_type: 'onedimensional',
      parameters: { length_truncate_factor: 254.0, optimization_mode: 'not-anytime-deterministic', not_anytime_tree_search_queue_size: 16, verbosity_level: 0 },
      instance: {
        objective: 'variable-sized-bin-packing',
        parameters: {},
        bin_types: [{ copies: 100, width: mm(3000), cost: 1 }],
        item_types: Array.from({ length: kinds }, () => ({ copies: 1 + Math.floor(rnd() * 6), width: mm(200 + Math.floor(rnd() * 1400)) })),
      },
    },
  });
  return [sheet('sheet-small', 20, 5), sheet('sheet-medium', 60, 12), sheet('sheet-large', 150, 25), bars('bars', 15)];
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function load(dir) {
  const { default: createPacky } = await import(pathToFileURL(path.join(dir, 'packy.js')));
  return createPacky();
}

async function run(m, input) {
  const call = (ptr) => JSON.parse(m.UTF8ToString(ptr));
  const ptr = m.stringToNewUTF8(JSON.stringify(input));
  const t0 = performance.now();
  try {
    const start = call(m._c_optimize_start(ptr));
    for (;;) {
      const out = call(m._c_optimize_advance(start.run_id));
      if (!out.running) {
        const ms = performance.now() - t0;
        if (out.error) return { error: out.error, ms };
        const s = out.solution;
        return { bins: s.number_of_bins, eff: s.full_efficiency ?? s.efficiency, ms };
      }
      await new Promise((r) => setTimeout(r, 5));
    }
  } finally {
    m._free(ptr);
  }
}

if (isMainThread) {
  const args = process.argv.slice(2);
  const dir = path.resolve(args[0]);
  const workers = args.includes('--workers') ? Number(args[args.indexOf('--workers') + 1]) : Math.min(4, os.availableParallelism());
  const label = args.includes('--label') ? args[args.indexOf('--label') + 1] : path.basename(dir);
  const ps = problems();
  const m = await load(dir);
  console.log(`# ${label} — Packy ${m.UTF8ToString(m._c_version())}, threaded build: ${readFileSync(path.join(dir, 'packy.js'), 'utf8').includes('SharedArrayBuffer')}`);
  console.log('\n| problem | bins | efficiency | time (ms) |\n|---|---:|---:|---:|');
  let serial = 0;
  for (const p of ps) {
    const r = await run(m, p.input);
    serial += r.ms;
    console.log(r.error ? `| ${p.name} | error: ${r.error} | | |` : `| ${p.name} | ${r.bins} | ${(r.eff * 100).toFixed(1)}% | ${Math.round(r.ms)} |`);
  }
  console.log(`\nOne at a time: ${Math.round(serial)} ms in total.`);

  // The same set ×workers, spread over N Workers.
  const jobs = Array.from({ length: workers }, () => ps).flat();
  const t0 = performance.now();
  const queue = [...jobs.keys()];
  const results = [];
  await Promise.all(Array.from({ length: workers }, () => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { dir } });
    const next = () => {
      const i = queue.shift();
      if (i === undefined) { w.terminate(); resolve(); return; }
      w.postMessage({ i, input: jobs[i].input });
    };
    w.on('message', (msg) => { if (msg.ready) return next(); results[msg.i] = msg.r; next(); });
    w.on('error', reject);
  })));
  const wall = performance.now() - t0;
  const errors = results.filter((r) => r.error).length;
  console.log(`${jobs.length} runs on ${workers} Workers: ${Math.round(wall)} ms wall clock (${Math.round(serial * workers)} ms if run one at a time)${errors ? `, ${errors} error(s)` : ''}.`);
  process.exit(0);
} else {
  const m = await load(workerData.dir);
  parentPort.on('message', async ({ i, input }) => parentPort.postMessage({ i, r: await run(m, input) }));
  parentPort.postMessage({ ready: true });
}
