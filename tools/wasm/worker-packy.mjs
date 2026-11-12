// One single-threaded Packy module per Worker: runs the job it's sent, posts the result.
// The handler is set before the module loads, so no message is lost while it does.
import createPacky from './packy.js';
const ready = createPacky();
self.onmessage = async (e) => {
  const m = await ready;
  const t0 = performance.now();
  const ptr = m.stringToNewUTF8(JSON.stringify(e.data));
  try {
    const start = JSON.parse(m.UTF8ToString(m._c_optimize_start(ptr)));
    // single-threaded: the run is done when c_optimize_start returns
    const out = JSON.parse(m.UTF8ToString(m._c_optimize_advance(start.run_id)));
    if (out.error) return self.postMessage({ error: out.error });
    if (out.running) return self.postMessage({ error: 'still running: not the single-threaded build?' });
    const s = out.solution;
    self.postMessage({ bins: s.number_of_bins, placed: s.bins.reduce((t, b) => t + b.copies * b.items.length, 0), ms: Math.round(performance.now() - t0) });
  } finally {
    m._free(ptr);
  }
};
